import { describe, expect, it } from "vitest";
import {
  applyRetention,
  backupFilename,
  EMPTY_BACKUP_STATE,
  isBackupDue,
  waitForDownload,
  type DownloadsApi,
} from "../../src/lib/storage/backup";
import { ollamaOriginsHelp, testConnection } from "../../src/lib/models/connection";
import { historyModel } from "../../src/lib/records/history";
import { world } from "../helpers";

const DAY = 86_400_000;

describe("backup", () => {
  it("is due when never run or a week has passed", () => {
    expect(isBackupDue(EMPTY_BACKUP_STATE, 0)).toBe(true);
    expect(isBackupDue({ lastAt: 0, downloadIds: [] }, 6 * DAY)).toBe(false);
    expect(isBackupDue({ lastAt: 0, downloadIds: [] }, 7 * DAY)).toBe(true);
  });

  it("names files by device and UTC date and keeps the newest four", () => {
    expect(backupFilename("dev_7f3a", Date.UTC(2026, 8, 25, 23))).toBe("harkback/backup-dev_7f3a-2026-09-25.jsonl");
    expect(applyRetention([1, 2, 3, 4], 5)).toEqual({ keep: [2, 3, 4, 5], remove: [1] });
    expect(applyRetention([1], 2)).toEqual({ keep: [1, 2], remove: [] });
  });
});

describe("testConnection", () => {
  const json =
    (body: unknown, status = 200) =>
    async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("lists models on success and sends the trimmed key", async () => {
    let auth: string | null = null;
    const fetchImpl = async (_: RequestInfo | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ data: [{ id: "b" }, { id: "a" }] }));
    };
    expect(await testConnection({ baseUrl: "https://api.example.com/v1/", apiKey: " k ", provider: "custom" }, fetchImpl)).toEqual({
      kind: "ok",
      models: ["a", "b"],
    });
    expect(auth).toBe("Bearer k");
  });

  it("lists Anthropic models with x-api-key", async () => {
    let seen: { url: string; headers: Headers } | null = null;
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(url), headers: new Headers(init?.headers) };
      return new Response(JSON.stringify({ data: [{ id: "claude-b" }, { id: "claude-a" }] }));
    };
    expect(await testConnection({ baseUrl: "https://api.anthropic.com/v1", apiKey: " k ", provider: "anthropic" }, fetchImpl)).toEqual({
      kind: "ok",
      models: ["claude-a", "claude-b"],
    });
    expect(seen!.url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    expect(seen!.headers.get("x-api-key")).toBe("k");
    expect(seen!.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(seen!.headers.get("authorization")).toBeNull();
  });

  it("lists Gemini models that can generate content, without the models/ prefix, and reads 400 as a bad key", async () => {
    let seen: { url: string; headers: Headers } | null = null;
    const body = {
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent", "countTokens"] },
      ],
    };
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(url), headers: new Headers(init?.headers) };
      return new Response(JSON.stringify(body));
    };
    const cfgG = { baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKey: "g", provider: "gemini" };
    expect(await testConnection(cfgG, fetchImpl)).toEqual({ kind: "ok", models: ["gemini-2.5-flash", "gemini-2.5-pro"] });
    expect(seen!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000");
    expect(seen!.headers.get("x-goog-api-key")).toBe("g");
    expect(await testConnection(cfgG, json({}, 400))).toEqual({ kind: "auth" });
  });

  it("tells a blocked Ollama origin apart from a bad key", async () => {
    expect(await testConnection({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", provider: "ollama" }, json({}, 403))).toEqual({
      kind: "origin_blocked",
    });
    expect(await testConnection({ baseUrl: "https://api.example.com/v1", apiKey: "k", provider: "custom" }, json({}, 401))).toEqual({
      kind: "auth",
    });
    expect(await testConnection({ baseUrl: "https://api.example.com/v1", apiKey: "k", provider: "custom" }, json({}, 500))).toEqual({
      kind: "http",
      status: 500,
    });
    expect(await testConnection({ baseUrl: "http://api.example.com/v1", apiKey: "k", provider: "custom" }, json({}))).toEqual({
      kind: "insecure",
    });
    const down = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await testConnection({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", provider: "ollama" }, down)).toEqual({
      kind: "unreachable",
    });
  });

  it("gives OLLAMA_ORIGINS commands for the extension origin", () => {
    const help = ollamaOriginsHelp("chrome-extension://abc");
    expect(help.mac).toBe('launchctl setenv OLLAMA_ORIGINS "chrome-extension://abc"');
    expect(help.windows).toBe('setx OLLAMA_ORIGINS "chrome-extension://abc"');
    expect(help.linux).toContain("OLLAMA_ORIGINS=chrome-extension://abc");
  });
});

describe("historyModel", () => {
  const w = world(Date.UTC(2026, 8, 1));
  w.source("arxiv:1", "normal", "LoRA paper");
  const lora = w.concept("LoRA", ["低秩适配"]);
  w.encounter(lora, "arxiv:1", "在冻结的权重旁加低秩矩阵。");
  w.setTime(Date.UTC(2026, 8, 5));
  const later = w.encounter(lora, "arxiv:1", "第二次解释。");
  w.setTime(Date.UTC(2026, 8, 3));
  const attention = w.concept("Attention");
  w.encounter(attention, "arxiv:1", "按相关性加权。");
  w.concept("QLoRA");
  const state = w.state();

  it("lists real concepts, newest activity first, entries newest first", () => {
    const model = historyModel(state);
    expect(model.map((c) => c.name)).toEqual(["LoRA", "Attention"]);
    expect(model[0]!.aliases).toEqual(["低秩适配"]);
    expect(model[0]!.entries.map((e) => e.encounterId)[0]).toBe(later);
    expect(model[0]!.entries[0]).toMatchObject({ date: "2026-09-05", sourceTitle: "LoRA paper", tier: "external_knowledge" });
  });

  it("searches names, then selections, explanations and titles", () => {
    expect(historyModel(state, "低秩适配").map((c) => c.entries.length)).toEqual([2]);
    expect(historyModel(state, "相关性").map((c) => c.name)).toEqual(["Attention"]);
    expect(historyModel(state, "第二次")[0]!.entries.map((e) => e.explanation)).toEqual(["第二次解释。"]);
    expect(historyModel(state, "nothing matches")).toEqual([]);
  });
});

describe("historyModel follow-ups", () => {
  const w = world(Date.UTC(2026, 8, 1));
  w.source("arxiv:1", "normal", "BLEU paper");
  const bleu = w.concept("BLEU");
  const first = w.encounter(bleu, "arxiv:1", "A metric for translations.");
  const other = w.encounter(bleu, "arxiv:1", "Second look.");
  const ask = (encounterId: string, question: string, answer: string) =>
    w.events.push(w.f.make("encounter.action", { encounter_id: encounterId, action: "followed_up", detail: { question, answer } }));
  w.setTime(Date.UTC(2026, 8, 2));
  ask(first, "How is it calculated?", "Using modified n-gram precision.");
  w.setTime(Date.UTC(2026, 8, 3));
  ask(first, "When should I use it?", "For corpus-level comparison.");
  w.events.push(w.f.make("encounter.action", { encounter_id: other, action: "marked_understood" }));
  const state = w.state();

  it("keeps the whole conversation of an explanation, oldest question first", () => {
    const entries = historyModel(state)[0]!.entries;
    const withChat = entries.find((e) => e.encounterId === first)!;
    expect(withChat.followUps.map((f) => f.question)).toEqual(["How is it calculated?", "When should I use it?"]);
    expect(withChat.followUps[0]!.answer).toBe("Using modified n-gram precision.");
    expect(entries.find((e) => e.encounterId === other)!.followUps).toEqual([]);
  });

  it("finds entries by what was asked or answered", () => {
    expect(historyModel(state, "corpus-level")[0]!.entries.map((e) => e.encounterId)).toEqual([first]);
    expect(historyModel(state, "how is it calculated")[0]!.entries.map((e) => e.encounterId)).toEqual([first]);
    expect(historyModel(state, "nothing like this")).toEqual([]);
  });
});

describe("waitForDownload", () => {
  function fake(initial?: "in_progress" | "complete" | "interrupted") {
    let listener: ((d: { id: number; state?: { current?: "in_progress" | "interrupted" | "complete" } }) => void) | undefined;
    const api: DownloadsApi = {
      search: async () => (initial ? [{ state: initial }] : []),
      onChanged: {
        addListener: (l) => void (listener = l),
        removeListener: () => void (listener = undefined),
      },
    };
    return {
      api,
      fire: (id: number, current: "in_progress" | "interrupted" | "complete") => listener?.({ id, state: { current } }),
      active: () => listener !== undefined,
    };
  }

  it("resolves when the download completes or is interrupted, ignoring other downloads", async () => {
    const a = fake("in_progress");
    const done = waitForDownload(a.api, 7);
    a.fire(8, "complete");
    a.fire(7, "in_progress");
    a.fire(7, "complete");
    expect(await done).toBe("complete");
    expect(a.active()).toBe(false);

    const b = fake("in_progress");
    const failed = waitForDownload(b.api, 7);
    b.fire(7, "interrupted");
    expect(await failed).toBe("interrupted");
  });

  it("notices a download that finished before it started listening, and gives up on one that never settles", async () => {
    expect(await waitForDownload(fake("complete").api, 1)).toBe("complete");
    expect(await waitForDownload(fake("in_progress").api, 1, 20)).toBe("interrupted");
  });
});
