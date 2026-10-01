import type { ChatMessage } from "@harkback/core";
import { modelUrlError } from "./model-policy";
import { apiTypeOf, type ModelConfig } from "./settings";
import type { ApiType } from "./providers";
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
    .replace(/\/messages$/i, "")
    .replace(/\/+$/, "");
}

/** Wrapped so `fetch` keeps its `window`/worker receiver when passed around. */
export const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

export function requestHeaders(apiKey: string, headers: Record<string, string>): Record<string, string> {
  const key = apiKey.trim();
  return key ? { ...headers, authorization: `Bearer ${key}` } : headers;
}

export interface StreamOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  idleTimeoutMs?: number;
  temperature?: number;
}

/** What one streamed payload adds, and whether it says the answer is complete. */
interface Chunk {
  text: string;
  finished: boolean;
}

/** One wire format: how to ask, and how to read the reply. */
interface Adapter {
  url(cfg: ModelConfig): string;
  headers(cfg: ModelConfig): Record<string, string>;
  body(cfg: ModelConfig, messages: readonly ChatMessage[], opts: StreamOptions): unknown;
  /** A streamed JSON payload. May throw a ModelError for an error the service sent inside the stream. */
  chunk(json: unknown): Chunk;
  /** The text of a reply that was not streamed. */
  full(json: unknown): string;
  /** A better classification of a failed HTTP reply than its status alone, when the body says more. */
  httpError?(status: number, body: string): ModelError | null;
}

const asObject = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** An error the service reported inside a reply that arrived with status 200. */
function reportedError(status: number | undefined, kind: string, message: string): ModelError {
  const k = kind.toLowerCase();
  if (status === 401 || status === 403 || /authentication|permission|unauthenticated/.test(k))
    return new ModelError("auth", message, status);
  if (status === 429 || /rate_limit|resource_exhausted/.test(k)) return new ModelError("rate_limited", message, status);
  return new ModelError("http", message, status);
}

type Choice = { delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: unknown };

const systemOf = (messages: readonly ChatMessage[]): string =>
  messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
const userTurns = (messages: readonly ChatMessage[]): string[] => messages.filter((m) => m.role !== "system").map((m) => m.content);

const openai: Adapter = {
  url: (cfg) => `${normalizeBaseUrl(cfg.baseUrl)}/chat/completions`,
  headers: (cfg) => requestHeaders(cfg.apiKey, { "content-type": "application/json", accept: "text/event-stream, application/json" }),
  // Some models reject any non-default temperature, so only send one when asked to.
  body: (cfg, messages, opts) => ({
    model: cfg.model.trim(),
    messages,
    stream: true,
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
  }),
  chunk(json) {
    const choice = (json as { choices?: Choice[] } | null)?.choices?.[0];
    const value = choice?.delta?.content ?? choice?.message?.content;
    const reason = choice?.finish_reason;
    return { text: typeof value === "string" ? value : "", finished: typeof reason === "string" && reason !== "" };
  },
  full(json) {
    const value = (json as { choices?: Choice[] } | null)?.choices?.[0]?.message?.content;
    return typeof value === "string" ? value : "";
  },
};

/** Anthropic's Messages API. */
const anthropic: Adapter = {
  url: (cfg) => `${normalizeBaseUrl(cfg.baseUrl)}/messages`,
  headers: (cfg) => {
    const key = cfg.apiKey.trim();
    return {
      "content-type": "application/json",
      accept: "text/event-stream, application/json",
      "anthropic-version": "2023-06-01",
      // Only needed when a page, not an extension, calls the API; harmless here.
      "anthropic-dangerous-direct-browser-access": "true",
      ...(key && { "x-api-key": key }),
    };
  },
  body: (cfg, messages, opts) => {
    const system = systemOf(messages);
    return {
      model: cfg.model.trim(),
      max_tokens: 4096,
      stream: true,
      ...(system && { system }),
      messages: userTurns(messages).map((content) => ({ role: "user", content })),
      ...(opts.temperature !== undefined && { temperature: opts.temperature }),
    };
  },
  chunk(json) {
    const o = asObject(json);
    if (o.type === "error") {
      const e = asObject(o.error);
      throw reportedError(undefined, text(e.type), text(e.message) || "the model service reported an error");
    }
    if (o.type === "message_stop") return { text: "", finished: true };
    if (o.type === "content_block_delta") {
      const d = asObject(o.delta);
      if (d.type === "text_delta") return { text: text(d.text), finished: false };
    }
    return { text: "", finished: false };
  },
  full(json) {
    const content = asObject(json).content;
    return Array.isArray(content) ? content.map((b) => (asObject(b).type === "text" ? text(asObject(b).text) : "")).join("") : "";
  },
};

/** Google's Gemini API (`generateContent`). */
const gemini: Adapter = {
  url: (cfg) =>
    `${normalizeBaseUrl(cfg.baseUrl)}/models/${encodeURIComponent(cfg.model.trim().replace(/^models\//, ""))}:streamGenerateContent?alt=sse`,
  headers: (cfg) => {
    const key = cfg.apiKey.trim();
    return { "content-type": "application/json", accept: "text/event-stream, application/json", ...(key && { "x-goog-api-key": key }) };
  },
  body: (_cfg, messages, opts) => {
    const system = systemOf(messages);
    return {
      ...(system && { systemInstruction: { parts: [{ text: system }] } }),
      contents: userTurns(messages).map((content) => ({ role: "user", parts: [{ text: content }] })),
      ...(opts.temperature !== undefined && { generationConfig: { temperature: opts.temperature } }),
    };
  },
  chunk(json) {
    const o = asObject(json);
    if ("error" in o) {
      const e = asObject(o.error);
      throw reportedError(
        typeof e.code === "number" ? e.code : undefined,
        text(e.status),
        text(e.message) || "the model service reported an error",
      );
    }
    const block = text(asObject(asObject(o.promptFeedback)).blockReason);
    if (block) throw new ModelError("http", `the prompt was blocked: ${block}`);
    const candidate = asObject(Array.isArray(o.candidates) ? o.candidates[0] : undefined);
    const parts = asObject(candidate.content).parts;
    const added = Array.isArray(parts) ? parts.map((p) => (asObject(p).thought === true ? "" : text(asObject(p).text))).join("") : "";
    return { text: added, finished: text(candidate.finishReason) !== "" };
  },
  full(json) {
    const candidate = asObject(Array.isArray(asObject(json).candidates) ? (asObject(json).candidates as unknown[])[0] : undefined);
    const parts = asObject(candidate.content).parts;
    return Array.isArray(parts) ? parts.map((p) => text(asObject(p).text)).join("") : "";
  },
  // Gemini answers a wrong key with 400 rather than 401.
  httpError: (status, body) =>
    status === 400 && /API_KEY_INVALID|API key not valid/i.test(body) ? new ModelError("auth", "HTTP 400", 400) : null,
};

const ADAPTERS: Record<ApiType, Adapter> = { openai, anthropic, gemini };

export async function streamChat(
  cfg: ModelConfig,
  messages: readonly ChatMessage[],
  onText: (full: string) => void,
  opts: StreamOptions = {},
): Promise<string> {
  if (modelUrlError(cfg.baseUrl)) throw new ModelError("insecure", "model address rejected");
  const adapter = ADAPTERS[apiTypeOf(cfg)];
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
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

  let full = "";
  try {
    arm();
    const res = await fetchImpl(adapter.url(cfg), {
      method: "POST",
      headers: adapter.headers(cfg),
      body: JSON.stringify(adapter.body(cfg, messages, opts)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const better = adapter.httpError ? adapter.httpError(res.status, await res.text().catch(() => "")) : null;
      if (better) throw better;
      if (res.status === 401 || res.status === 403) throw new ModelError("auth", `HTTP ${res.status}`, res.status);
      if (res.status === 429) throw new ModelError("rate_limited", "HTTP 429", 429);
      throw new ModelError("http", `HTTP ${res.status}`, res.status);
    }
    if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
      const raw = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ModelError("http", "unreadable response", res.status);
      }
      full = adapter.full(json);
      if (!full.trim()) throw new ModelError("http", "empty response", res.status);
      onText(full);
      return full;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const parser = new SseParser();
    // Only a stream that says it finished counts as a complete answer.
    let finished = false;
    const handle = (payloads: string[]): boolean => {
      for (const payload of payloads) {
        if (payload.trim() === "[DONE]") return (finished = true);
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const chunk = adapter.chunk(json);
        if (chunk.finished) finished = true;
        if (chunk.text) {
          full += chunk.text;
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
    if (!finished) throw new ModelError("network", "the stream ended early");
    if (!full.trim()) throw new ModelError("http", "empty response", res.status);
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
