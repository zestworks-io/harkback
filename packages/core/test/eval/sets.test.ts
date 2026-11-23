import { describe, expect, it } from "vitest";
import { identityKey } from "../../src";
import { evaluate, lookupKey, replayRecording } from "../../src/eval/evaluate";
import { checkGates } from "../../src/eval/gates";
import { EVAL_SETS } from "./cases";
import { oracleRecording } from "./oracle";

describe.each(Object.entries(EVAL_SETS))("evaluation set %s", (_name, set) => {
  const labels = new Set(Object.keys(set.concepts));

  it("only refers to labelled concepts and existing paragraphs", () => {
    const wrong: string[] = [];
    for (const r of set.relations) for (const l of [r.from, r.to]) if (!labels.has(l)) wrong.push(`relation ${l}`);
    for (const p of set.papers) {
      for (const l of p.reunions) if (!labels.has(l)) wrong.push(`${p.id} reunion ${l}`);
      p.lookups.forEach((l, i) => {
        if (!labels.has(l.concept)) wrong.push(`${lookupKey(p, i)} ${l.concept}`);
        if (!p.paragraphs[l.paragraph]?.text.toLowerCase().includes(l.selection.toLowerCase())) wrong.push(`${lookupKey(p, i)} paragraph`);
      });
    }
    expect(wrong).toEqual([]);
  });

  it("gives no name to two concepts", () => {
    const owner = new Map<string, string>();
    const shared: string[] = [];
    for (const [label, names] of Object.entries(set.concepts)) {
      for (const name of names) {
        const prev = owner.get(identityKey(name));
        if (prev && prev !== label) shared.push(`${name}: ${prev}, ${label}`);
        owner.set(identityKey(name), label);
      }
    }
    expect(shared).toEqual([]);
  });

  it("expects reunions only for concepts looked up in an earlier paper", () => {
    const seen = new Set<string>();
    const early: string[] = [];
    for (const p of set.papers) {
      for (const l of p.reunions) if (!seen.has(l)) early.push(`${p.id}: ${l}`);
      for (const l of p.lookups) seen.add(l.concept);
    }
    expect(early).toEqual([]);
  });
});

describe("evaluation sets together", () => {
  it("name every paper differently, so recorded answers of all sets can share one file", () => {
    const ids = Object.values(EVAL_SETS).flatMap((s) => s.papers.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/** The domain a model would give each set's concepts. */
const DOMAIN: Record<string, string> = { ml: "ml", quantum: "physics" };

describe.each(Object.entries(EVAL_SETS))("evaluation set %s, scored with answers built from its labels", (name, set) => {
  it("comes out right throughout, so its reunion, concept and relation labels agree", async () => {
    const { metrics, misses } = await evaluate(set, replayRecording(oracleRecording(set, DOMAIN[name] ?? "other")));
    expect(misses).toEqual([]);
    expect(metrics.reunionPrecision.value).toBe(1);
    expect(metrics.reunionRecall.value).toBe(1);
    expect(checkGates(metrics).every((g) => g.pass)).toBe(true);
  });
});
