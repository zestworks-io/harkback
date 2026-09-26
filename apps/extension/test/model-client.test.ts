import { describe, expect, it } from "vitest";
import { ModelError, normalizeBaseUrl, streamChat } from "../src/lib/model-client";
import type { ModelConfig } from "../src/lib/settings";
import { SseParser } from "../src/lib/sse";

const cfg: ModelConfig = { id: "m", label: "M", baseUrl: "https://api.example.com/v1", apiKey: "sk-1", model: "gpt" };
const messages = [{ role: "user" as const, content: "hi" }];

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

function sse(chunks: string[]): Response {
  return new Response(streamOf(chunks), { headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}`;

describe("SseParser", () => {
  it("handles CRLF, split lines, comments and multi-line data", () => {
    const p = new SseParser();
    expect(p.push("data: a\r")).toEqual([]);
    expect(p.push("\n\r\n: keep-alive\n")).toEqual(["a"]);
    expect(p.push("data: b\ndata: c\n\nda")).toEqual(["b\nc"]);
    expect(p.push("ta: d")).toEqual([]);
    expect(p.end()).toEqual(["d"]);
  });
});

describe("streamChat", () => {
  it("accumulates deltas across chunk boundaries, including a split tag", async () => {
    const texts: string[] = [];
    const body = `${delta("<expla")}\r\n\r\n${delta("nation>低秩")}\n\n${delta("适配</explanation>")}\n\ndata: [DONE]\n\n`;
    const fetchImpl = async () => sse([body.slice(0, 25), body.slice(25, 90), body.slice(90)]);
    const full = await streamChat(cfg, messages, (t) => texts.push(t), { fetchImpl });
    expect(full).toBe("<explanation>低秩适配</explanation>");
    expect(texts.at(-1)).toBe(full);
  });

  it("accepts a non-streaming JSON reply", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "<explanation>ok</explanation>" } }] }), {
        headers: { "content-type": "application/json" },
      });
    expect(await streamChat(cfg, messages, () => {}, { fetchImpl })).toBe("<explanation>ok</explanation>");
  });

  it("normalizes pasted base URLs and trims the API key", async () => {
    let seen: { url: string; auth: string | null; body: { model: string; stream: boolean } } | null = null;
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = {
        url: String(input),
        auth: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      };
      return sse([`${delta("x")}\n\ndata: [DONE]\n\n`]);
    };
    await streamChat({ ...cfg, baseUrl: " https://api.example.com/v1/chat/completions/ ", apiKey: " sk-1\n", model: " gpt " }, messages, () => {}, { fetchImpl });
    expect(seen).toEqual({ url: "https://api.example.com/v1/chat/completions", auth: "Bearer sk-1", body: expect.objectContaining({ model: "gpt", stream: true }) });
    expect(normalizeBaseUrl("http://127.0.0.1:11434/v1/")).toBe("http://127.0.0.1:11434/v1");
  });

  it("sends no authorization header without a key", async () => {
    let auth: string | null = "unset";
    const fetchImpl = async (_: RequestInfo | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return sse([`${delta("x")}\n\ndata: [DONE]\n\n`]);
    };
    await streamChat({ ...cfg, baseUrl: "http://127.0.0.1:11434/v1", apiKey: "  " }, messages, () => {}, { fetchImpl });
    expect(auth).toBeNull();
  });

  it("treats a stream that ends without a completion marker as interrupted", async () => {
    const cut = async () => sse([`${delta("<explanation>half")}\n\n`]);
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: cut })).rejects.toMatchObject({ code: "network" });
    const finished = `data: ${JSON.stringify({ choices: [{ delta: { content: "done" }, finish_reason: "stop" }] })}\n\n`;
    expect(await streamChat(cfg, messages, () => {}, { fetchImpl: async () => sse([finished]) })).toBe("done");
  });

  it("rejects replies with no content, such as errors sent with status 200", async () => {
    const jsonError = async () =>
      new Response(JSON.stringify({ error: { message: "quota" } }), { headers: { "content-type": "application/json" } });
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: jsonError })).rejects.toMatchObject({ code: "http" });
    const sseError = async () => sse([`data: ${JSON.stringify({ error: { message: "quota" } })}\n\ndata: [DONE]\n\n`]);
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: sseError })).rejects.toMatchObject({ code: "http" });
  });

  it("classifies HTTP errors", async () => {
    const status = (s: number) => async () => new Response("no", { status: s });
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: status(401) })).rejects.toMatchObject({ code: "auth", status: 401 });
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: status(429) })).rejects.toMatchObject({ code: "rate_limited" });
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: status(500) })).rejects.toMatchObject({ code: "http", status: 500 });
  });

  it("times out when the stream stalls", async () => {
    const fetchImpl = async (_: RequestInfo | URL, init?: RequestInit) => {
      // Like a real fetch: aborting the request errors the response body.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${delta("a")}\n\n`));
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    };
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl, idleTimeoutMs: 50 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports network failures and cancellation", async () => {
    const fail = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: fail })).rejects.toMatchObject({ code: "network" });
    const controller = new AbortController();
    controller.abort();
    const aborting = async (_: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return sse([]);
    };
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: aborting, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("refuses a remote http address without calling fetch", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return sse([]);
    };
    const err = await streamChat({ ...cfg, baseUrl: "http://api.example.com/v1" }, messages, () => {}, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.code).toBe("insecure");
    expect(called).toBe(false);
  });
});
