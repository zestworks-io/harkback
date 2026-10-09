import type { ChatMessage } from "@harkback/core";
import { ModelError } from "./model-error";

/** The address a built-in model is saved with; nothing is ever requested from it. */
export const BUILTIN_URL = "chrome-ai://prompt-api";
export const BUILTIN_MODEL = "gemini-nano";

export const isBuiltInUrl = (url: string): boolean => url.trim() === BUILTIN_URL;

/** `unsupported`: this Chrome has no Prompt API. The rest are the states the API itself reports. */
export type BuiltInState = "available" | "downloadable" | "downloading" | "unavailable" | "unsupported";

interface PromptSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

interface CreateOptions {
  initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
  monitor?(m: EventTarget): void;
}

/** The part of Chrome's Prompt API (the `LanguageModel` global) that is used here. */
export interface PromptApi {
  availability(): Promise<Exclude<BuiltInState, "unsupported">>;
  create(options?: CreateOptions): Promise<PromptSession>;
}

const globalApi = (): PromptApi | undefined => (globalThis as { LanguageModel?: PromptApi }).LanguageModel;

export async function builtInState(api: PromptApi | undefined = globalApi()): Promise<BuiltInState> {
  if (!api) return "unsupported";
  try {
    return await api.availability();
  } catch {
    return "unavailable";
  }
}

/**
 * Downloads the model. Chrome only allows this from a click, so it is called from a page the reader is looking at, never from the
 * background. `onProgress` gets a fraction between 0 and 1.
 */
export async function downloadBuiltIn(
  onProgress: (fraction: number) => void,
  api: PromptApi | undefined = globalApi(),
): Promise<BuiltInState> {
  if (!api) return "unsupported";
  try {
    const session = await api.create({
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => onProgress(Number((e as Event & { loaded?: number }).loaded ?? 0)));
      },
    });
    session.destroy();
  } catch {
    // The state below says whether it worked.
  }
  return builtInState(api);
}

export interface BuiltInOptions {
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  firstTextTimeoutMs?: number;
  api?: PromptApi;
}

const isNamed = (e: unknown, name: string): boolean => e instanceof Error && e.name === name;

/**
 * One chat turn on Chrome's on-device model. The messages end with the reader's turn; earlier ones become the conversation so far.
 * The model's window is small, and a prompt that does not fit is not cut: its task is at the end, so cutting would change the question.
 */
export async function builtInChat(
  messages: readonly ChatMessage[],
  onText: (full: string) => void,
  opts: BuiltInOptions = {},
): Promise<string> {
  const api = opts.api ?? globalApi();
  const state = await builtInState(api);
  if (state !== "available" || !api) throw new ModelError("unavailable", `built-in model ${state}`);
  const last = messages.at(-1);
  if (!last || last.role !== "user") throw new ModelError("http", "the last message must be the reader's");
  // The API takes one system prompt, first; any others are joined into it.
  const system = messages
    .slice(0, -1)
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const history = messages.slice(0, -1).filter((m) => m.role !== "system");
  const initialPrompts = [...(system ? [{ role: "system" as const, content: system }] : []), ...history];
  try {
    return await run(api, initialPrompts, last.content, onText, opts);
  } catch (e) {
    if (e instanceof ModelError) throw e;
    if (isNamed(e, "QuotaExceededError")) throw new ModelError("http", "the prompt is too long for the on-device model");
    if (isNamed(e, "NotSupportedError")) throw new ModelError("http", "the on-device model does not support this request");
    throw new ModelError("http", e instanceof Error ? e.message : String(e));
  }
}

async function run(
  api: PromptApi,
  initialPrompts: NonNullable<CreateOptions["initialPrompts"]>,
  input: string,
  onText: (full: string) => void,
  opts: BuiltInOptions,
): Promise<string> {
  const idleMs = opts.idleTimeoutMs ?? 30_000;
  const firstMs = Math.max(idleMs, opts.firstTextTimeoutMs ?? 120_000);
  const controller = new AbortController();
  let full = "";
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      full ? idleMs : firstMs,
    );
  };
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  let session: PromptSession | undefined;
  try {
    arm();
    session = await api.create({ initialPrompts, signal: controller.signal });
    const reader = session.promptStreaming(input, { signal: controller.signal }).getReader();
    // A stream that does not notice the abort would otherwise leave this waiting for ever.
    const stopped = new Promise<never>((_, reject) => {
      const stop = () => reject(new DOMException("aborted", "AbortError"));
      if (controller.signal.aborted) stop();
      else controller.signal.addEventListener("abort", stop, { once: true });
    });
    stopped.catch(() => reader.cancel().catch(() => undefined));
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      // Each chunk is the next piece of the reply.
      full += value;
      onText(full);
      arm();
    }
    if (!full.trim()) throw new ModelError("http", "empty response");
    return full;
  } catch (e) {
    if (e instanceof ModelError || isNamed(e, "QuotaExceededError")) throw e;
    if (timedOut) throw new ModelError("timeout", "no response from the model");
    if (opts.signal?.aborted) throw new ModelError("aborted", "cancelled");
    throw e;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    session?.destroy();
  }
}
