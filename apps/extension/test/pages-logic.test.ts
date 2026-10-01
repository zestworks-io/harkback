import { describe, expect, it } from "vitest";
import { applyRetention, backupFilename, EMPTY_BACKUP_STATE, isBackupDue } from "../src/lib/backup";
import { ollamaOriginsHelp, testConnection } from "../src/lib/connection";
import { historyModel } from "../src/lib/history";
import { world } from "./helpers";

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
    expect(await testConnection({ baseUrl: "https://api.example.com/v1/", apiKey: " k " }, fetchImpl)).toEqual({
      kind: "ok",
      models: ["a", "b"],
    });
    expect(auth).toBe("Bearer k");
  });

  it("tells a blocked Ollama origin apart from a bad key", async () => {
    expect(await testConnection({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: "" }, json({}, 403))).toEqual({ kind: "origin_blocked" });
    expect(await testConnection({ baseUrl: "https://api.example.com/v1", apiKey: "k" }, json({}, 401))).toEqual({ kind: "auth" });
    expect(await testConnection({ baseUrl: "https://api.example.com/v1", apiKey: "k" }, json({}, 500))).toEqual({
      kind: "http",
      status: 500,
    });
    expect(await testConnection({ baseUrl: "http://api.example.com/v1", apiKey: "k" }, json({}))).toEqual({ kind: "insecure" });
    const down = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await testConnection({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: "" }, down)).toEqual({ kind: "unreachable" });
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
