import { describe, expect, it } from "vitest";
import { ModelError, normalizeBaseUrl, streamChat } from "../src/lib/model-client";
import type { ModelConfig } from "../src/lib/settings";
import { SseParser } from "../src/lib/sse";

const cfg: ModelConfig = { id: "m", label: "M", baseUrl: "https://api.example.com/v1", apiKey: "sk-1", model: "gpt", provider: "openai" };
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
    await streamChat(
      { ...cfg, baseUrl: " https://api.example.com/v1/chat/completions/ ", apiKey: " sk-1\n", model: " gpt " },
      messages,
      () => {},
      { fetchImpl },
    );
    expect(seen).toEqual({
      url: "https://api.example.com/v1/chat/completions",
      auth: "Bearer sk-1",
      body: expect.objectContaining({ model: "gpt", stream: true }),
    });
    expect(normalizeBaseUrl("http://127.0.0.1:11434/v1/")).toBe("http://127.0.0.1:11434/v1");
  });

  it("omits temperature unless the caller sets one", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = async (_: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return sse([`${delta("x")}\n\ndata: [DONE]\n\n`]);
    };
    await streamChat(cfg, messages, () => {}, { fetchImpl });
    await streamChat(cfg, messages, () => {}, { fetchImpl, temperature: 0.5 });
    expect(bodies[0]).not.toHaveProperty("temperature");
    expect(bodies[1]).toHaveProperty("temperature", 0.5);
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

  describe("before the first text", () => {
    const quietThen = (waitMs: number, tail: string) => async (_: RequestInfo | URL, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const timer = setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(tail));
            controller.close();
          }, waitMs);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    };

    it("waits longer than the idle limit for a slow first token", async () => {
      const reply = `${delta("<explanation>ok</explanation>")}\n\ndata: [DONE]\n\n`;
      const fetchImpl = quietThen(150, reply);
      await expect(streamChat(cfg, messages, () => {}, { fetchImpl, idleTimeoutMs: 50, firstTextTimeoutMs: 1000 })).resolves.toBeDefined();
    });

    it("times out when no text arrives within the first-text limit", async () => {
      const fetchImpl = quietThen(5000, "");
      await expect(streamChat(cfg, messages, () => {}, { fetchImpl, idleTimeoutMs: 20, firstTextTimeoutMs: 100 })).rejects.toMatchObject({
        code: "timeout",
      });
    });
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
    await expect(streamChat(cfg, messages, () => {}, { fetchImpl: aborting, signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
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

const system = { role: "system" as const, content: "be brief" };
const claude: ModelConfig = { ...cfg, baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-5-5", provider: "anthropic" };
const gem: ModelConfig = {
  ...cfg,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-2.5-flash",
  apiKey: " g-key ",
  provider: "gemini",
};

function capture(response: () => Response) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return response();
  };
  return { calls, fetchImpl };
}

const event = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`;

describe("streamChat with the Anthropic API", () => {
  const okStream = () =>
    sse([
      event("message_start", { message: { id: "m" } }),
      event("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
      event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "<explanation>低秩" } }),
      event("ping", {}),
      event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "适配</explanation>" } }),
      event("message_delta", { delta: { stop_reason: "end_turn" } }),
      event("message_stop", {}),
    ]);

  it("posts to /messages with the key in x-api-key, the system prompt apart and max_tokens set", async () => {
    const { calls, fetchImpl } = capture(okStream);
    const seen: string[] = [];
    const full = await streamChat({ ...claude, apiKey: " sk-ant " }, [system, ...messages], (t) => seen.push(t), { fetchImpl });
    expect(full).toBe("<explanation>低秩适配</explanation>");
    expect(seen.at(-1)).toBe(full);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers.get("x-api-key")).toBe("sk-ant");
    expect(call.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.body).toMatchObject({
      model: "claude-sonnet-5-5",
      stream: true,
      system: "be brief",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(call.body.max_tokens).toBeGreaterThan(0);
  });

  it("only sends a temperature when asked and tolerates a pasted /messages address", async () => {
    const { calls, fetchImpl } = capture(okStream);
    await streamChat({ ...claude, baseUrl: "https://api.anthropic.com/v1/messages" }, messages, () => {}, { fetchImpl });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.body.temperature).toBeUndefined();
    const second = capture(okStream);
    await streamChat(claude, messages, () => {}, { fetchImpl: second.fetchImpl, temperature: 0.2 });
    expect(second.calls[0]!.body.temperature).toBe(0.2);
  });

  it("treats a stream without message_stop as interrupted", async () => {
    const cut = async () => sse([event("content_block_delta", { delta: { type: "text_delta", text: "half" } })]);
    await expect(streamChat(claude, messages, () => {}, { fetchImpl: cut })).rejects.toMatchObject({ code: "network" });
  });

  it("classifies errors sent inside the stream and HTTP errors", async () => {
    const inStream = (kind: string) => async () => sse([event("error", { error: { type: kind, message: "x" } })]);
    await expect(streamChat(claude, messages, () => {}, { fetchImpl: inStream("authentication_error") })).rejects.toMatchObject({
      code: "auth",
    });
    await expect(streamChat(claude, messages, () => {}, { fetchImpl: inStream("rate_limit_error") })).rejects.toMatchObject({
      code: "rate_limited",
    });
    await expect(streamChat(claude, messages, () => {}, { fetchImpl: inStream("overloaded_error") })).rejects.toMatchObject({
      code: "http",
    });
    const status = (s: number) => async () => new Response("no", { status: s });
    await expect(streamChat(claude, messages, () => {}, { fetchImpl: status(401) })).rejects.toMatchObject({ code: "auth" });
    await expect(streamChat(claude, messages, () => {}, { fetchImpl: status(429) })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("reads a reply that was not streamed", async () => {
    const json = async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "plain " },
            { type: "text", text: "answer" },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    expect(await streamChat(claude, messages, () => {}, { fetchImpl: json })).toBe("plain answer");
  });
});

describe("streamChat with the Gemini API", () => {
  const part = (t: string, extra: object = {}) =>
    `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, ...extra }] })}\n\n`;

  it("posts to streamGenerateContent with the key in x-goog-api-key and the system prompt as systemInstruction", async () => {
    const { calls, fetchImpl } = capture(() => sse([part("<explanation>低秩"), part("适配</explanation>", { finishReason: "STOP" })]));
    const full = await streamChat(gem, [system, ...messages], () => {}, { fetchImpl });
    expect(full).toBe("<explanation>低秩适配</explanation>");
    const call = calls[0]!;
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
    expect(call.headers.get("x-goog-api-key")).toBe("g-key");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.body).toEqual({
      systemInstruction: { parts: [{ text: "be brief" }] },
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
    });
  });

  it("accepts a model written as models/<name>, adds a temperature only when asked, and skips thought parts", async () => {
    const thought = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "answer" }] }, finishReason: "STOP" }] })}\n\n`;
    const { calls, fetchImpl } = capture(() => sse([thought]));
    const full = await streamChat({ ...gem, model: "models/gemini-2.5-pro" }, messages, () => {}, { fetchImpl, temperature: 0.3 });
    expect(full).toBe("answer");
    expect(calls[0]!.url).toContain("/models/gemini-2.5-pro:streamGenerateContent");
    expect(calls[0]!.body.generationConfig).toEqual({ temperature: 0.3 });
    expect(calls[0]!.body.systemInstruction).toBeUndefined();
  });

  it("skips thought parts in a reply that was not streamed", async () => {
    const plain = async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "answer" }] } }] }), {
        headers: { "content-type": "application/json" },
      });
    expect(await streamChat(gem, messages, () => {}, { fetchImpl: plain })).toBe("answer");
  });

  it("treats a stream without a finish reason as interrupted", async () => {
    const cut = async () => sse([part("half")]);
    await expect(streamChat(gem, messages, () => {}, { fetchImpl: cut })).rejects.toMatchObject({ code: "network" });
  });

  it("reports blocked prompts, in-stream errors and a wrong key", async () => {
    const blocked = async () => sse([`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}\n\n`]);
    await expect(streamChat(gem, messages, () => {}, { fetchImpl: blocked })).rejects.toMatchObject({ code: "http" });
    const quota = async () =>
      sse([`data: ${JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota" } })}\n\n`]);
    await expect(streamChat(gem, messages, () => {}, { fetchImpl: quota })).rejects.toMatchObject({ code: "rate_limited" });
    const badKey = async () =>
      new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "API key not valid." } }), { status: 400 });
    await expect(streamChat(gem, messages, () => {}, { fetchImpl: badKey })).rejects.toMatchObject({ code: "auth" });
    const other = async () => new Response("bad request", { status: 400 });
    await expect(streamChat(gem, messages, () => {}, { fetchImpl: other })).rejects.toMatchObject({ code: "http", status: 400 });
  });
});

describe("streamChat for a Grok or other OpenAI-compatible address", () => {
  it("uses the OpenAI format with a bearer key", async () => {
    const { calls, fetchImpl } = capture(() => sse([`${delta("ok")}\n\ndata: [DONE]\n\n`]));
    await streamChat({ ...cfg, baseUrl: "https://api.x.ai/v1", model: "grok-4" }, messages, () => {}, { fetchImpl });
    expect(calls[0]!.url).toBe("https://api.x.ai/v1/chat/completions");
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer sk-1");
    expect(calls[0]!.body).toMatchObject({ model: "grok-4", messages, stream: true });
  });
});
