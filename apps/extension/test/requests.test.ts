import { createEventFactory, edgeId, type EventFactory } from "@harkback/core";
import type { HarkEvent } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import type { Request } from "../src/lib/messages";
import { handleRequest, pageInfo, type RequestDeps } from "../src/lib/requests";
import { withDefaults } from "../src/lib/settings";
import { world } from "./helpers";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25);

function setup(settings: unknown = {}) {
  const w = world();
  w.source("arxiv:1", "normal", "Paper One");
  const conceptId = w.concept("LoRA");
  const encounterId = w.encounter(conceptId, "arxiv:1");
  const written: HarkEvent[] = [];
  const calls = { compact: 0, backup: 0, sync: 0 };
  const deps: RequestDeps = {
    loadSettings: async () => withDefaults({ reunion: { minGapDays: 0 }, ...(settings as object) }),
    getState: async () => w.state(),
    append: async (build: (f: EventFactory) => HarkEvent[]) => {
      const events = build(createEventFactory({ device: "dev_bbbb", nextSeq: () => written.length + 1, now: () => NOW }));
      written.push(...events);
      return events;
    },
    compact: async () => void calls.compact++,
    runBackup: async () => void calls.backup++,
    syncContentScripts: async () => void calls.sync++,
    now: () => NOW + DAY,
  };
  return { deps, written, calls, conceptId, encounterId, w };
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
    expect(await handleRequest(deps, { type: "review-answer", conceptId, action: "marked_understood" }, extensionPage)).toEqual({
      ok: true,
    });
    expect(await handleRequest(deps, { type: "review-answer", conceptId, action: "marked_confused" }, extensionPage)).toEqual({ ok: true });
    expect(written.map((e) => [e.type, (e.payload as { action?: string }).action])).toEqual([
      ["encounter.action", "marked_understood"],
      ["encounter.action", "marked_confused"],
    ]);
  });

  it("refuses a review answer for an unknown concept or an action it cannot take", async () => {
    const { deps, written, conceptId } = setup();
    expect(await handleRequest(deps, { type: "review-answer", conceptId: "missing", action: "marked_understood" }, extensionPage)).toEqual({
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
