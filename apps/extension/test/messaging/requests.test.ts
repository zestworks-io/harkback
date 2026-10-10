import { createEventFactory, edgeId, type EventFactory } from "@harkback/core";
import type { HarkEvent } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import type { Request } from "../../src/lib/messaging/messages";
import { handleRequest, pageInfo, type RequestDeps } from "../../src/lib/messaging/requests";
import type { SenderInfo } from "../../src/lib/messaging/sender-auth";
import { withDefaults, type Settings } from "../../src/lib/storage/settings";
import { world } from "../helpers";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25);

function setup(settings: unknown = {}) {
  const w = world();
  w.source("arxiv:1", "normal", "Paper One");
  const conceptId = w.concept("LoRA");
  const encounterId = w.encounter(conceptId, "arxiv:1");
  const written: HarkEvent[] = [];
  const imported: HarkEvent[] = [];
  const calls = { compact: 0, backup: 0, sync: 0 };
  const checked: { conceptId: string; answer: string }[] = [];
  const saved: Settings[] = [];
  const previewed: unknown[] = [];
  const deps: RequestDeps = {
    loadSettings: async () => withDefaults({ reunion: { minGapDays: 0 }, ...(settings as object) }),
    getState: async () => w.state(),
    append: async (build: (f: EventFactory) => HarkEvent[]) => {
      const events = build(createEventFactory({ device: "dev_bbbb", nextSeq: () => written.length + 1, now: () => NOW }));
      written.push(...events);
      return events;
    },
    compact: async () => void calls.compact++,
    importEvents: async (events: HarkEvent[]) => {
      imported.push(...events);
      return events.length;
    },
    runBackup: async () => void calls.backup++,
    checkAnswer: async (conceptId: string, answer: string) => {
      checked.push({ conceptId, answer });
      return { ok: true as const, verdict: "partial" as const, feedback: "close", suggested: 2 as const, model: "m" };
    },
    saveSettings: async (settings: Settings) => void saved.push(settings),
    previewPlan: async (req) => {
      previewed.push(req);
      return { ok: true as const, model: "m", remote: false };
    },
    previewTerms: async () => ({ ok: true as const, terms: [], model: "m", remote: false }),
    previewExplain: async () => ({ ok: true as const, explanation: "x", stored: false }),
    syncContentScripts: async () => void calls.sync++,
    now: () => NOW + DAY,
  };
  return { deps, written, imported, calls, checked, saved, previewed, conceptId, encounterId, w };
}

const page = { url: "https://arxiv.org/abs/2", tab: { id: 1, incognito: false } };
const priv = { url: "https://arxiv.org/abs/2", tab: { id: 1, incognito: true } };
const sourceFor = (id: string) => ({ source_id: id, ids: {}, title: "T", license: "unknown" });

describe("page-info", () => {
  it("scans arXiv automatically and sends the matcher entries", async () => {
    const { deps } = setup();
    const info = await pageInfo(deps, "https://arxiv.org/abs/2", false);
    expect(info).toMatchObject({ enabled: true, autoScan: true, scan: true, incognito: false });
    expect(info.entries.map((e) => e.pattern)).toEqual(["LoRA"]);
  });

  it("does not scan or send entries in a private window", async () => {
    const { deps } = setup();
    expect(await pageInfo(deps, "https://arxiv.org/abs/2", true)).toMatchObject({
      enabled: true,
      scan: false,
      incognito: true,
      entries: [],
    });
  });

  it("reports a disabled site and scans an allow-listed one only when asked", async () => {
    const { deps } = setup({
      sites: [
        { pattern: "off.example.com", disabled: true },
        { pattern: "blog.example.com", autoScan: true },
      ],
    });
    expect(await pageInfo(deps, "https://off.example.com/x", false)).toMatchObject({ enabled: false, scan: false, entries: [] });
    expect(await pageInfo(deps, "https://blog.example.com/x", false)).toMatchObject({ enabled: true, autoScan: true });
    expect(await pageInfo(deps, "https://other.example.com/x", false)).toMatchObject({ enabled: true, autoScan: false });
  });
});

describe("reunions", () => {
  const hit = { key: "LoRA", start: 0, end: 4, text: "LoRA" };

  it("returns cards for known concepts", async () => {
    const { deps } = setup();
    const r = (await handleRequest(deps, { type: "reunions", sourceId: "arxiv:2", hits: [hit] }, page)) as { cards: unknown[] };
    expect(r.cards).toHaveLength(1);
  });

  it("returns nothing in a private window, on a disabled site, or for malformed hits", async () => {
    const { deps } = setup({ sites: [{ pattern: "arxiv.org", disabled: true }] });
    const msg: Request = { type: "reunions", sourceId: "arxiv:2", hits: [hit] };
    expect(await handleRequest(deps, msg, page)).toEqual({ cards: [] });
    const open = setup();
    expect(await handleRequest(open.deps, msg, priv)).toEqual({ cards: [] });
    expect(await handleRequest(open.deps, { ...msg, hits: [{ key: 1 }, null, "x"] as never }, page)).toEqual({ cards: [] });
    expect(await handleRequest(open.deps, { ...msg, hits: "nope" as never }, page)).toEqual({ cards: [] });
  });
});

describe("writes", () => {
  it("records an action, mute and sensitivity mark for a normal window", async () => {
    const { deps, written, encounterId, conceptId } = setup();
    expect(await handleRequest(deps, { type: "action", encounterId, action: "marked_understood" }, page)).toEqual({ ok: true });
    expect(await handleRequest(deps, { type: "mute", conceptId }, page)).toEqual({ ok: true });
    expect(await handleRequest(deps, { type: "mark-sensitive", source: sourceFor("arxiv:1") }, page)).toEqual({ ok: true });
    expect(written.map((e) => e.type)).toEqual(["encounter.action", "concept.muted", "source.seen"]);
    expect(written[2]!.payload).toMatchObject({ source_id: "arxiv:1", sensitivity: "sensitive" });
  });

  it("records that a term means something else on a page, and refuses an empty page or a private window", async () => {
    const { deps, written, conceptId } = setup();
    expect(await handleRequest(deps, { type: "dismiss-reunion", conceptId, sourceId: "arxiv:9" }, page)).toEqual({ ok: true });
    expect(written.map((e) => e.type)).toEqual(["reunion.dismissed"]);
    expect(written[0]!.payload).toMatchObject({ concept_id: conceptId, source_id: "arxiv:9" });
    expect(await handleRequest(deps, { type: "dismiss-reunion", conceptId, sourceId: "" }, page)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "dismiss-reunion", conceptId: "nope", sourceId: "arxiv:9" }, page)).toEqual({ ok: false });
    expect(
      await handleRequest(deps, { type: "dismiss-reunion", conceptId, sourceId: "arxiv:9" }, {
        ...page,
        tab: { incognito: true },
      } as never),
    ).toEqual({
      ok: false,
    });
    expect(written).toHaveLength(1);
  });

  it("lets the reader mark a sensitive source normal again, and says so in the event", async () => {
    const { deps, written, w } = setup();
    w.source("secret", "sensitive", "Secret doc");
    expect(await handleRequest(deps, { type: "mark-normal", sourceId: "arxiv:1" }, { id: "x" })).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "mark-normal", sourceId: "secret" }, { id: "x" })).toEqual({ ok: true });
    expect(written[0]!.payload).toMatchObject({ source_id: "secret", title: "Secret doc", sensitivity: "normal", by_user: true });
  });

  it("imports only valid events", async () => {
    const { deps, imported, w, written } = setup();
    const good = w.events[0]!;
    const r = await handleRequest(deps, { type: "import-events", events: [good, { nonsense: true } as never] }, { id: "x" });
    expect(r).toEqual({ ok: true, added: 1 });
    expect(imported).toEqual([good]);
    expect(written).toEqual([]);
    expect(await handleRequest(deps, { type: "import-events", events: "x" as never }, { id: "x" })).toEqual({ ok: false });
  });

  it("refuses every write from a private window", async () => {
    const { deps, written, encounterId, conceptId } = setup();
    expect(await handleRequest(deps, { type: "action", encounterId, action: "marked_understood" }, priv)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "mute", conceptId }, priv)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "mark-sensitive", source: sourceFor("arxiv:1") }, priv)).toEqual({ ok: false });
    expect(written).toEqual([]);
  });

  it("refuses actions that a reader cannot take or that name unknown records", async () => {
    const { deps, written, encounterId } = setup();
    expect(await handleRequest(deps, { type: "action", encounterId, action: "followed_up" as never }, page)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "action", encounterId: "missing", action: "marked_confused" }, page)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "mute", conceptId: "missing" }, page)).toEqual({ ok: false });
    expect(written).toEqual([]);
  });
});

describe("page-only requests", () => {
  const extensionPage = { url: "chrome-extension://abc/library.html" };

  it("deletes an encounter and compacts", async () => {
    const { deps, written, calls, encounterId } = setup();
    expect(await handleRequest(deps, { type: "delete-encounter", encounterId }, extensionPage)).toEqual({ ok: true });
    expect(written.map((e) => e.type)).toEqual(["encounter.deleted"]);
    expect(calls.compact).toBe(1);
    expect(await handleRequest(deps, { type: "delete-encounter", encounterId: "missing" }, extensionPage)).toEqual({ ok: false });
  });

  it("records a review answer on the concept's latest encounter", async () => {
    const { deps, written, conceptId } = setup();
    expect(await handleRequest(deps, { type: "review-answer", conceptId, action: "review_good" }, extensionPage)).toEqual({ ok: true });
    expect(written.map((e) => [e.type, (e.payload as { action?: string }).action])).toEqual([["encounter.action", "review_good"]]);
  });

  it("does not take the older marks as review answers", async () => {
    const { deps, written, conceptId } = setup();
    for (const action of ["marked_understood", "marked_confused", "reunion_recalled"] as const) {
      expect(await handleRequest(deps, { type: "review-answer", conceptId, action: action as never }, extensionPage)).toEqual({
        ok: false,
      });
    }
    expect(written).toEqual([]);
  });

  it("records the four review grades", async () => {
    const { deps, written, conceptId } = setup();
    for (const action of ["review_again", "review_hard", "review_good", "review_easy"] as const) {
      expect(await handleRequest(deps, { type: "review-answer", conceptId, action }, extensionPage)).toEqual({ ok: true });
    }
    expect(written.map((e) => (e.payload as { action?: string }).action)).toEqual([
      "review_again",
      "review_hard",
      "review_good",
      "review_easy",
    ]);
  });

  it("passes a typed answer to the model check, trimmed and cut to a safe length", async () => {
    const { deps, checked, conceptId } = setup();
    const r = await handleRequest(deps, { type: "check-answer", conceptId, answer: `  ${"a".repeat(3000)}  ` }, extensionPage);
    expect(r).toMatchObject({ ok: true, verdict: "partial", suggested: 2 });
    expect(checked).toHaveLength(1);
    expect(checked[0]!.answer).toHaveLength(2000);
    expect(checked[0]!.conceptId).toBe(conceptId);
  });

  it("does not call the model for an empty answer", async () => {
    const { deps, checked, conceptId } = setup();
    expect(await handleRequest(deps, { type: "check-answer", conceptId, answer: "   " }, extensionPage)).toEqual({
      ok: false,
      code: "internal",
    });
    expect(await handleRequest(deps, { type: "check-answer", conceptId, answer: 5 as never }, extensionPage)).toEqual({
      ok: false,
      code: "internal",
    });
    expect(checked).toEqual([]);
  });

  it("asks which model a scan would use without passing any page text", async () => {
    const { deps } = setup();
    const seen: unknown[] = [];
    deps.previewPlan = async (r) => {
      seen.push(r);
      return { ok: true, model: "Ollama", remote: false };
    };
    expect(
      await handleRequest(
        deps,
        { type: "preview-plan", sourceId: "arxiv:1" },
        { url: "https://arxiv.org/abs/2", tab: { id: 1, incognito: false } },
      ),
    ).toEqual({
      ok: true,
      model: "Ollama",
      remote: false,
    });
    expect(seen).toEqual([{ url: "https://arxiv.org/abs/2", sourceId: "arxiv:1" }]);
  });

  it("passes the page text of a scan on, cut to a safe length, and refuses an empty page", async () => {
    const seen: { text: string; incognito: boolean }[] = [];
    const { deps } = setup();
    deps.previewTerms = async (r) => {
      seen.push({ text: r.text, incognito: r.incognito });
      return { ok: true, terms: [], model: "m", remote: false };
    };
    const scan = (text: string, sender: SenderInfo = extensionPage) =>
      handleRequest(deps, { type: "preview-terms", sourceId: "arxiv:1", title: "T", text }, sender);
    expect(await scan("   ")).toEqual({ ok: false, code: "internal" });
    expect(seen).toEqual([]);
    await scan("x".repeat(50_000));
    expect(seen[0]!.text).toHaveLength(16_000);
    await scan("hello", { ...extensionPage, tab: { id: 1, incognito: true } });
    expect(seen[1]!.incognito).toBe(true);
  });

  it("never reads the records for a preview from a private window", async () => {
    const { deps, conceptId } = setup();
    const asked: (string | null)[] = [];
    deps.previewExplain = async (r) => {
      asked.push(r.conceptId);
      return { ok: true, explanation: "x", stored: false };
    };
    const ask = (sender: SenderInfo = extensionPage) =>
      handleRequest(deps, { type: "preview-explain", sourceId: "arxiv:1", title: "T", term: " LoRA ", conceptId, context: "" }, sender);
    await ask();
    await ask({ ...extensionPage, tab: { id: 1, incognito: true } });
    expect(asked).toEqual([conceptId, null]);
    expect(
      await handleRequest(
        deps,
        { type: "preview-explain", sourceId: "a", title: "", term: "  ", conceptId: null, context: "" },
        extensionPage,
      ),
    ).toEqual({
      ok: false,
      code: "internal",
    });
  });

  it("refuses a review answer for an unknown concept or an action it cannot take", async () => {
    const { deps, written, conceptId } = setup();
    expect(await handleRequest(deps, { type: "review-answer", conceptId: "missing", action: "review_good" }, extensionPage)).toEqual({
      ok: false,
    });
    expect(await handleRequest(deps, { type: "review-answer", conceptId, action: "followed_up" as never }, extensionPage)).toEqual({
      ok: false,
    });
    expect(written).toEqual([]);
  });

  describe("corrections", () => {
    it("merges one concept into another through their representatives", async () => {
      const { deps, written, conceptId, w } = setup();
      const other = w.concept("Low-Rank Adaptation Method");
      w.encounter(other, "arxiv:1");
      expect(await handleRequest(deps, { type: "merge-concepts", fromId: other, intoId: conceptId }, extensionPage)).toEqual({ ok: true });
      expect(written.map((e) => [e.type, e.payload])).toEqual([["concept.merged", { from: other, into: conceptId }]]);
    });

    it("refuses to merge a concept with itself or an unknown one", async () => {
      const { deps, written, conceptId } = setup();
      expect(await handleRequest(deps, { type: "merge-concepts", fromId: conceptId, intoId: conceptId }, extensionPage)).toEqual({
        ok: false,
      });
      expect(await handleRequest(deps, { type: "merge-concepts", fromId: "missing", intoId: conceptId }, extensionPage)).toEqual({
        ok: false,
      });
      expect(written).toEqual([]);
    });

    it("adds a trimmed alias once", async () => {
      const { deps, written, conceptId } = setup();
      expect(await handleRequest(deps, { type: "add-alias", conceptId, alias: "  Low-rank adapters " }, extensionPage)).toEqual({
        ok: true,
      });
      expect(written.map((e) => [e.type, e.payload])).toEqual([
        ["concept.alias_added", { concept_id: conceptId, alias: "Low-rank adapters" }],
      ]);
      expect(await handleRequest(deps, { type: "add-alias", conceptId, alias: " LoRA " }, extensionPage)).toEqual({ ok: true });
      expect(written).toHaveLength(1);
    });

    it("refuses an alias that would merge the concept with another one", async () => {
      const { deps, written, conceptId, w } = setup();
      const other = w.concept("Matrix rank");
      w.encounter(other, "arxiv:1");
      expect(await handleRequest(deps, { type: "add-alias", conceptId, alias: "matrix  RANK" }, extensionPage)).toEqual({
        ok: false,
        collides: true,
      });
      const llm = w.concept("LLM");
      w.encounter(llm, "arxiv:1");
      expect(await handleRequest(deps, { type: "add-alias", conceptId, alias: "Large Language Model" }, extensionPage)).toEqual({
        ok: false,
        collides: true,
      });
      expect(written).toEqual([]);
    });

    it("refuses an empty, oversized or unknown alias", async () => {
      const { deps, written, conceptId } = setup();
      expect(await handleRequest(deps, { type: "add-alias", conceptId, alias: "   " }, extensionPage)).toEqual({ ok: false });
      expect(await handleRequest(deps, { type: "add-alias", conceptId, alias: "x".repeat(500) }, extensionPage)).toEqual({ ok: false });
      expect(await handleRequest(deps, { type: "add-alias", conceptId: "missing", alias: "ok" }, extensionPage)).toEqual({ ok: false });
      expect(written).toEqual([]);
    });

    it("rejects a relation that exists and refuses one that does not", async () => {
      const { deps, written, conceptId, w } = setup();
      const other = w.concept("Matrix rank");
      w.encounter(other, "arxiv:1");
      w.events.push(
        w.f.make("edge.proposed", {
          from: conceptId,
          to: other,
          rel: "prerequisite",
          source: "llm_explain",
          confidence: 0.9,
          evidence: {},
        }),
      );
      const id = edgeId(conceptId, "prerequisite", other);
      expect(await handleRequest(deps, { type: "reject-edge", edgeId: id }, extensionPage)).toEqual({ ok: true });
      expect(written.map((e) => [e.type, e.payload])).toEqual([["edge.rejected", { edge_id: id }]]);
      expect(await handleRequest(deps, { type: "reject-edge", edgeId: "nope" }, extensionPage)).toEqual({ ok: false });
      expect(written).toHaveLength(1);
    });

    it("mutes and unmutes a concept", async () => {
      const { deps, written, conceptId } = setup();
      expect(await handleRequest(deps, { type: "set-muted", conceptId, muted: true }, extensionPage)).toEqual({ ok: true });
      expect(await handleRequest(deps, { type: "set-muted", conceptId, muted: false }, extensionPage)).toEqual({ ok: true });
      expect(await handleRequest(deps, { type: "set-muted", conceptId: "missing", muted: true }, extensionPage)).toEqual({ ok: false });
      expect(written.map((e) => e.type)).toEqual(["concept.muted", "concept.unmuted"]);
    });
  });

  it("reports a failed backup with its message", async () => {
    const { deps } = setup();
    deps.runBackup = async () => {
      throw new Error("disk full");
    };
    expect(await handleRequest(deps, { type: "backup-now" }, extensionPage)).toEqual({ ok: false, error: "disk full" });
  });

  it("re-registers content scripts when settings change", async () => {
    const { deps, calls } = setup();
    expect(await handleRequest(deps, { type: "settings-changed" }, extensionPage)).toEqual({ ok: true });
    expect(calls.sync).toBe(1);
  });
});

describe("the reader's answer about a page that looks private", () => {
  const github = { url: "https://github.com/acme/secret", tab: { id: 1, incognito: false } };
  const githubPrivate = { url: "https://github.com/acme/secret", tab: { id: 1, incognito: true } };

  it("records that the reader chose to send it, as their own decision", async () => {
    const { deps, written } = setup();
    expect(await handleRequest(deps, { type: "choose-normal", source: sourceFor("github:acme/secret") }, github)).toEqual({ ok: true });
    expect(written[0]!.payload).toMatchObject({ source_id: "github:acme/secret", sensitivity: "normal", by_user: true });
  });

  it("will not make a sensitive source normal this way, nor write from a private window", async () => {
    const { deps, written, w } = setup();
    w.source("github:acme/secret", "sensitive", "t", {}, true);
    expect(await handleRequest(deps, { type: "choose-normal", source: sourceFor("github:acme/secret") }, github)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "choose-normal", source: sourceFor("github:acme/secret#4") }, github)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "choose-normal", source: sourceFor("other") }, githubPrivate)).toEqual({ ok: false });
    expect(written).toEqual([]);
  });

  it("remembers the answer for the whole site as a rule", async () => {
    const { deps, saved } = setup({ sites: [{ pattern: "github.com", autoScan: true }] });
    expect(await handleRequest(deps, { type: "remember-site", sensitive: true }, github)).toEqual({ ok: true });
    expect(saved[0]!.sites).toEqual([{ pattern: "github.com", autoScan: true, sensitive: true }]);
    expect(await handleRequest(deps, { type: "remember-site", sensitive: false }, github)).toEqual({ ok: true });
    expect(saved[1]!.sites).toEqual([{ pattern: "github.com", autoScan: true, sensitive: false }]);
  });

  it("adds a rule when the site has none, and refuses a private window or a page that is not a website", async () => {
    const { deps, saved } = setup();
    expect(await handleRequest(deps, { type: "remember-site", sensitive: true }, github)).toEqual({ ok: true });
    expect(saved[0]!.sites).toEqual([{ pattern: "github.com", sensitive: true }]);
    expect(await handleRequest(deps, { type: "remember-site", sensitive: true }, githubPrivate)).toEqual({ ok: false });
    expect(await handleRequest(deps, { type: "remember-site", sensitive: true }, { url: "chrome-extension://abc/x.html" })).toEqual({
      ok: false,
    });
    expect(saved).toHaveLength(1);
  });

  it("passes what the page suggests and the reader chose on to the preview, and drops anything else", async () => {
    const { deps, previewed } = setup();
    await handleRequest(deps, { type: "preview-plan", sourceId: "s", privacy: "likely-private", choice: "local" }, page);
    await handleRequest(deps, { type: "preview-plan", sourceId: "s", privacy: "bogus" as never, choice: "x" as never }, page);
    expect(previewed[0]).toMatchObject({ privacy: "likely-private", choice: "local" });
    expect(previewed[1]).not.toHaveProperty("privacy");
    expect(previewed[1]).not.toHaveProperty("choice");
  });
});

describe("unmarking a source that is sensitive only because of its repository", () => {
  const github = { url: "https://github.com/acme/secret/issues/4", tab: { id: 1, incognito: false } };

  it("records the reader's word on that one source, even if it was never recorded", async () => {
    const { deps, written, w } = setup();
    w.source("github:acme/secret", "sensitive", "Repo", {}, true);
    const source = sourceFor("github:acme/secret#4");
    expect(await handleRequest(deps, { type: "mark-normal", sourceId: source.source_id, source }, github)).toEqual({ ok: true });
    expect(written[0]!.payload).toMatchObject({ source_id: "github:acme/secret#4", sensitivity: "normal", by_user: true });
  });

  it("still refuses a source nothing makes sensitive", async () => {
    const { deps, written } = setup();
    const source = sourceFor("github:acme/open#4");
    expect(await handleRequest(deps, { type: "mark-normal", sourceId: source.source_id, source }, github)).toEqual({ ok: false });
    expect(written).toEqual([]);
  });
});

describe("source-status", () => {
  const github = { url: "https://github.com/acme/secret", tab: { id: 1, incognito: false } };
  const status = async (deps: RequestDeps, o: object, from = github) =>
    handleRequest(deps, { type: "source-status", sourceId: "github:acme/secret", ...o } as Request, from);

  it("says whether the page is sensitive, would be asked about, or is fine", async () => {
    const { deps, w } = setup();
    expect(await status(deps, {})).toEqual({ status: "normal" });
    expect(await status(deps, { privacy: "likely-private" })).toEqual({ status: "ask" });
    expect(await status(deps, { privacy: "likely-private", choice: "anyway" })).toEqual({ status: "normal" });
    w.source("github:acme/secret", "sensitive", "t", {}, true);
    expect(await status(deps, { privacy: "likely-public" })).toEqual({ status: "sensitive" });
  });

  it("follows a site rule", async () => {
    const { deps } = setup({ sites: [{ pattern: "github.com", sensitive: true }] });
    expect(await status(deps, {})).toEqual({ status: "sensitive", byRule: true });
  });
});

describe("unmarking and the lock", () => {
  const github = { url: "https://github.com/acme/secret", tab: { id: 1, incognito: false } };
  const inPrivate = { url: "https://github.com/acme/secret", tab: { id: 1, incognito: true } };

  it("never writes from a private window", async () => {
    const { deps, written, w } = setup();
    w.source("github:acme/secret", "sensitive", "Repo", {}, true);
    const source = sourceFor("github:acme/secret");
    expect(await handleRequest(deps, { type: "mark-normal", sourceId: source.source_id, source }, inPrivate)).toEqual({ ok: false });
    expect(written).toEqual([]);
  });

  it("says when a site rule is what makes a page sensitive, since the lock cannot undo that", async () => {
    const { deps } = setup({ sites: [{ pattern: "github.com", sensitive: true }] });
    expect(await handleRequest(deps, { type: "source-status", sourceId: "github:acme/secret" }, github)).toEqual({
      status: "sensitive",
      byRule: true,
    });
  });

  it("does not say so for a source the reader marked", async () => {
    const { deps, w } = setup();
    w.source("github:acme/secret", "sensitive", "Repo", {}, true);
    expect(await handleRequest(deps, { type: "source-status", sourceId: "github:acme/secret" }, github)).toEqual({ status: "sensitive" });
  });
});
