import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { HarkEvent } from "@harkback/spec";
import { compactDeleted, replay } from "../../src";
import { snapshotState } from "../snapshot";
import { id } from "../helpers";

const conceptIds = [1, 2, 3, 4, 5].map(id);
const encounterIds = [11, 12, 13, 14].map(id);
const names = ["LoRA", "Low-Rank Adaptation", "QLoRA", "LoRa", "attention", "Attention"];

const cid = fc.constantFrom(...conceptIds);
const eid = fc.constantFrom(...encounterIds);

const bodyArb = fc.oneof(
  fc.record({
    type: fc.constant("concept.created"),
    payload: fc.record({
      concept_id: cid,
      canonical_name: fc.constantFrom(...names),
      aliases: fc.subarray(names, { maxLength: 2 }),
      domain: fc.constantFrom("ml", "networking"),
    }),
  }),
  fc.record({ type: fc.constant("concept.alias_added"), payload: fc.record({ concept_id: cid, alias: fc.constantFrom(...names) }) }),
  fc.record({ type: fc.constant("concept.merged"), payload: fc.record({ from: cid, into: cid }) }),
  fc.record({ type: fc.constantFrom("concept.muted", "concept.unmuted"), payload: fc.record({ concept_id: cid }) }),
  fc.record({
    type: fc.constant("encounter.created"),
    payload: fc.record({
      encounter_id: eid,
      concept_id: cid,
      source_id: fc.constantFrom("arxiv:1", "arxiv:2"),
      locator: fc.constant({ exact: "x", prefix: "", suffix: "" }),
      selection: fc.constant("x"),
      explanation: fc.constant({ text: "t", tier: "external_knowledge", evidence_span: null, model: "m" }),
      flags: fc.constant([]),
    }),
  }),
  fc.record({
    type: fc.constant("encounter.action"),
    payload: fc.record({ encounter_id: eid, action: fc.constantFrom("marked_understood", "marked_confused", "reunion_recalled") }),
  }),
  fc.record({ type: fc.constant("encounter.deleted"), payload: fc.record({ encounter_id: eid }) }),
  fc.record({
    type: fc.constant("edge.proposed"),
    payload: fc.record({
      from: cid,
      to: cid,
      rel: fc.constantFrom("variant_of", "prerequisite"),
      source: fc.constantFrom("llm_explain", "user"),
      confidence: fc.constantFrom(0.3, 0.7, 0.8),
      evidence: fc.constant({}),
    }),
  }),
  fc.record({
    type: fc.constantFrom("edge.confirmed", "edge.rejected"),
    payload: fc.record({
      edge_id: fc.tuple(cid, fc.constantFrom("variant_of", "prerequisite"), cid).map(([a, r, b]) => `${a}>${r}>${b}`),
    }),
  }),
);

const logArb = fc
  .array(
    fc.tuple(
      bodyArb,
      fc.constantFrom("2026-09-01T00:00:00Z", "2026-09-01T00:00:00.500Z", "2026-09-02T00:00:00Z"),
      fc.constantFrom("dev_aaaa", "dev_bbbb"),
      fc.nat({ max: 50 }),
    ),
    { maxLength: 40 },
  )
  .map((items) =>
    items.map(([body, ts, device, seq], i) => ({ v: 1, id: id(1000 + i), device, seq, ts, enc: "none", ...body }) as unknown as HarkEvent),
  );

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

describe("replay properties", () => {
  it("is independent of event order", () => {
    fc.assert(
      fc.property(logArb, fc.nat(), (log, seed) => {
        expect(snapshotState(replay(shuffle(log, seed)))).toEqual(snapshotState(replay(log)));
      }),
    );
  });

  it("ignores duplicated events", () => {
    fc.assert(
      fc.property(logArb, (log) => {
        expect(snapshotState(replay([...log, ...log]))).toEqual(snapshotState(replay(log)));
      }),
    );
  });

  it("gives every merge class exactly one representative, its smallest member", () => {
    fc.assert(
      fc.property(logArb, (log) => {
        const s = replay(log);
        const classes = new Map<string, string[]>();
        for (const [member, rep] of s.representative) {
          const list = classes.get(rep);
          if (list) list.push(member);
          else classes.set(rep, [member]);
        }
        for (const [rep, members] of classes) {
          expect(rep).toBe([...members].sort()[0]);
          expect(s.representative.get(rep)).toBe(rep);
        }
        expect([...s.concepts.keys()].sort()).toEqual([...classes.keys()].sort());
      }),
    );
  });

  it("keeps edge endpoints on representatives and never produces self-loops", () => {
    fc.assert(
      fc.property(logArb, (log) => {
        const s = replay(log);
        for (const e of s.edges.values()) {
          expect(e.from).not.toBe(e.to);
          expect(s.concepts.has(e.from)).toBe(true);
          expect(s.concepts.has(e.to)).toBe(true);
        }
      }),
    );
  });

  it("marks exactly the concepts without live encounters as placeholders", () => {
    fc.assert(
      fc.property(logArb, (log) => {
        const s = replay(log);
        const withEncounters = new Set([...s.encounters.values()].map((e) => e.conceptId));
        for (const c of s.concepts.values()) expect(c.isPlaceholder).toBe(!withEncounters.has(c.id));
      }),
    );
  });

  it("produces the same state after compaction", () => {
    fc.assert(
      fc.property(logArb, (log) => {
        expect(snapshotState(replay(compactDeleted(log)))).toEqual(snapshotState(replay(log)));
      }),
    );
  });
});
