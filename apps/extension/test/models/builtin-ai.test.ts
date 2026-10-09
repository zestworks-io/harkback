import type { ChatMessage } from "@harkback/core";
import { describe, expect, it, vi } from "vitest";
import {
  BUILTIN_URL,
  builtInChat,
  builtInState,
  downloadBuiltIn,
  isBuiltInUrl,
  type BuiltInState,
  type PromptApi,
} from "../../src/lib/models/builtin-ai";
import { ModelError } from "../../src/lib/models/model-error";
import { chooseModel, isLocalUrl, modelUrlError } from "../../src/lib/models/model-policy";
import { streamChat } from "../../src/lib/models/model-client";
import { providerForAddress } from "../../src/lib/models/providers";
import { withDefaults, validateSettings } from "../../src/lib/storage/settings";
import { effectiveRule } from "../../src/lib/source/site-rules";

function streamOf(chunks: string[], opts: { hang?: boolean } = {}): ReadableStream<string> {
  let i = 0;
  return new ReadableStream<string>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else if (!opts.hang) controller.close();
      else return new Promise(() => undefined);
    },
  });
}

interface Fake {
  api: PromptApi;
  created: { initialPrompts?: unknown }[];
  prompts: string[];
  destroyed: () => number;
}

function fake(replies: (string[] | Error | "hang")[], state: BuiltInState = "available"): Fake {
  const created: Fake["created"] = [];
  const prompts: string[] = [];
  let destroyed = 0;
  let call = 0;
  const api: PromptApi = {
    availability: async () => state as Exclude<BuiltInState, "unsupported">,
    create: async (options) => {
      created.push({ initialPrompts: options?.initialPrompts });
      return {
        promptStreaming(input) {
          prompts.push(input);
          const reply = replies[Math.min(call++, replies.length - 1)]!;
          if (reply instanceof Error) throw reply;
          return streamOf(reply === "hang" ? [] : reply, { hang: reply === "hang" });
        },
        destroy: () => void destroyed++,
      };
    },
  };
  return { api, created, prompts, destroyed: () => destroyed };
}

const chat: ChatMessage[] = [
  { role: "system", content: "Be brief." },
  { role: "user", content: "What is LoRA?" },
];

const quota = () => Object.assign(new Error("too long"), { name: "QuotaExceededError" });

describe("the built-in model's address", () => {
  it("is on this computer, valid, and not a provider's address", () => {
    expect(isBuiltInUrl(BUILTIN_URL)).toBe(true);
    expect(isBuiltInUrl("https://api.openai.com/v1")).toBe(false);
    expect(isBuiltInUrl("chrome-ai://anything-else")).toBe(false);
    expect(isLocalUrl(BUILTIN_URL)).toBe(true);
    expect(modelUrlError(BUILTIN_URL)).toBeNull();
    expect(providerForAddress(BUILTIN_URL).id).toBe("chrome-ai");
  });

  it("can serve a sensitive source, as any local model can", () => {
    const model = { id: "n", label: "Nano", baseUrl: BUILTIN_URL, apiKey: "", model: "gemini-nano", provider: "chrome-ai" };
    const settings = withDefaults({ models: [model], defaultModelId: "n", localModelId: "n" });
    expect(validateSettings(settings)).toEqual([]);
    expect(chooseModel(settings, effectiveRule(settings.sites, "https://example.com"), true)).toMatchObject({ kind: "ok", remote: false });
  });
});

describe("builtInState", () => {
  it("reports the states of the API, and that there is none", async () => {
    for (const s of ["available", "downloadable", "downloading", "unavailable"] as const)
      expect(await builtInState(fake([["x"]], s).api)).toBe(s);
    expect(await builtInState({ ...fake([]).api, availability: async () => Promise.reject(new Error("no")) })).toBe("unavailable");
    expect(await builtInState(undefined)).toBe("unavailable".replace("unavailable", "unsupported"));
  });
});

describe("builtInChat", () => {
  it("streams the reply from pieces and puts the system prompt first", async () => {
    const f = fake([["Low-rank ", "adaptation."]]);
    const seen: string[] = [];
    expect(await builtInChat(chat, (t) => seen.push(t), { api: f.api })).toBe("Low-rank adaptation.");
    expect(seen).toEqual(["Low-rank ", "Low-rank adaptation."]);
    expect(f.created[0]!.initialPrompts).toEqual([{ role: "system", content: "Be brief." }]);
    expect(f.prompts).toEqual(["What is LoRA?"]);
    expect(f.destroyed()).toBe(1);
  });

  it("appends each chunk, even one that repeats the text so far", async () => {
    const f = fake([[" ", " a", "ha", "ha"]]);
    expect(await builtInChat(chat, () => undefined, { api: f.api })).toBe("  ahaha");
  });

  it("keeps earlier turns as the conversation so far", async () => {
    const f = fake([["ok"]]);
    await builtInChat(
      [
        { role: "system", content: "A" },
        { role: "system", content: "B" },
        { role: "user", content: "first" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "second" },
      ],
      () => undefined,
      { api: f.api },
    );
    expect(f.created[0]!.initialPrompts).toEqual([
      { role: "system", content: "A\nB" },
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
    ]);
    expect(f.prompts).toEqual(["second"]);
  });

  it("explains that the model is not ready instead of starting a download", async () => {
    for (const state of ["downloadable", "downloading", "unavailable"] as const) {
      const f = fake([["x"]], state);
      await expect(builtInChat(chat, () => undefined, { api: f.api })).rejects.toMatchObject({ code: "unavailable" });
      expect(f.created).toEqual([]);
    }
    await expect(builtInChat(chat, () => undefined, { api: undefined })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("does not cut a prompt that does not fit: it says so, once", async () => {
    const f = fake([quota()]);
    const long: ChatMessage[] = [{ role: "user", content: "x".repeat(1000) }];
    await expect(builtInChat(long, () => undefined, { api: f.api })).rejects.toMatchObject({
      code: "http",
      message: expect.stringContaining("too long"),
    });
    expect(f.prompts).toEqual(["x".repeat(1000)]);
    expect(f.destroyed()).toBe(1);
  });

  it("fails on an empty reply and on an answer that is not from the reader", async () => {
    await expect(builtInChat(chat, () => undefined, { api: fake([[]]).api })).rejects.toMatchObject({ code: "http" });
    await expect(builtInChat([{ role: "assistant", content: "hi" }], () => undefined, { api: fake([["x"]]).api })).rejects.toBeInstanceOf(
      ModelError,
    );
  });

  it("times out when the model goes quiet, and stops when told to", async () => {
    await expect(
      builtInChat(chat, () => undefined, { api: fake(["hang"]).api, firstTextTimeoutMs: 20, idleTimeoutMs: 20 }),
    ).rejects.toMatchObject({ code: "timeout" });
    const controller = new AbortController();
    const pending = builtInChat(chat, () => undefined, { api: fake(["hang"]).api, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });

  it("is what streamChat uses for the built-in address, with no request made", async () => {
    const cfg = { id: "n", label: "Nano", baseUrl: BUILTIN_URL, apiKey: "", model: "gemini-nano", provider: "chrome-ai" };
    const fetchImpl = vi.fn();
    // No LanguageModel in this environment: the failure is the built-in one, not a network error.
    await expect(streamChat(cfg, chat, () => undefined, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("downloadBuiltIn", () => {
  it("reports progress and the state afterwards", async () => {
    let state: Exclude<BuiltInState, "unsupported"> = "downloadable";
    const api: PromptApi = {
      availability: async () => state,
      create: async (options) => {
        const target = new EventTarget();
        options?.monitor?.(target);
        for (const loaded of [0.25, 1]) target.dispatchEvent(Object.assign(new Event("downloadprogress"), { loaded }));
        state = "available";
        return { promptStreaming: () => streamOf([]), destroy: () => undefined };
      },
    };
    const seen: number[] = [];
    expect(await downloadBuiltIn((f) => seen.push(f), api)).toBe("available");
    expect(seen).toEqual([0.25, 1]);
    expect(await downloadBuiltIn(() => undefined, undefined)).toBe("unsupported");
  });
});
