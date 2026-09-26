import type { ChatMessage } from "@harkback/core";
import { modelUrlError } from "./routing";
import type { ModelConfig } from "./settings";
import { SseParser } from "./sse";

export type ModelErrorCode = "auth" | "rate_limited" | "timeout" | "network" | "http" | "insecure" | "aborted";

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

export function normalizeBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/+$/, "");
}

export interface StreamOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  idleTimeoutMs?: number;
  temperature?: number;
}

type Choice = { delta?: { content?: unknown }; message?: { content?: unknown } };

function contentOf(json: unknown, streaming: boolean): string {
  const choice = (json as { choices?: Choice[] } | null)?.choices?.[0];
  const value = streaming ? (choice?.delta?.content ?? choice?.message?.content) : choice?.message?.content;
  return typeof value === "string" ? value : "";
}

export async function streamChat(
  cfg: ModelConfig,
  messages: readonly ChatMessage[],
  onText: (full: string) => void,
  opts: StreamOptions = {},
): Promise<string> {
  if (modelUrlError(cfg.baseUrl)) throw new ModelError("insecure", "model address rejected");
  const fetchImpl = opts.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const idleMs = opts.idleTimeoutMs ?? 30_000;
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleMs);
  };
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  const headers: Record<string, string> = { "content-type": "application/json", accept: "text/event-stream, application/json" };
  const key = cfg.apiKey.trim();
  if (key) headers.authorization = `Bearer ${key}`;

  let full = "";
  try {
    arm();
    const res = await fetchImpl(`${normalizeBaseUrl(cfg.baseUrl)}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: cfg.model.trim(), messages, stream: true, temperature: opts.temperature ?? 0.2 }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new ModelError("auth", `HTTP ${res.status}`, res.status);
      if (res.status === 429) throw new ModelError("rate_limited", "HTTP 429", 429);
      throw new ModelError("http", `HTTP ${res.status}`, res.status);
    }
    if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ModelError("http", "unreadable response", res.status);
      }
      full = contentOf(json, false);
      onText(full);
      return full;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const parser = new SseParser();
    const handle = (payloads: string[]): boolean => {
      for (const payload of payloads) {
        if (payload.trim() === "[DONE]") return true;
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const add = contentOf(json, true);
        if (add) {
          full += add;
          onText(full);
        }
      }
      return false;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        handle(parser.end());
        break;
      }
      arm();
      if (handle(parser.push(value))) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    return full;
  } catch (e) {
    if (e instanceof ModelError) throw e;
    if (timedOut) throw new ModelError("timeout", "no response from the model");
    if (opts.signal?.aborted) throw new ModelError("aborted", "cancelled");
    throw new ModelError("network", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
