import type { Action } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import { foundationGaps } from "../src/lib/foundation";
import { world } from "./helpers";

const T0 = Date.UTC(2026, 8, 1);

function setup() {
  const w = world(T0);
  w.source("s1", "normal", "Paper One");
  const act = (encounterId: string, action: Action) => w.events.push(w.f.make("encounter.action", { encounter_id: encounterId, action }));
  const needs = (from: string, to: string, confidence = 0.8) =>
    w.events.push(w.f.make("edge.proposed", { from, to, rel: "prerequisite", source: "llm_explain", confidence, evidence: {} }));
  const studied = (name: string, action?: Action) => {
    const id = w.concept(name);
    const e = w.encounter(id, "s1");
    if (action) act(e, action);
    return id;
  };
  return { w, act, needs, studied };
}
const names = (gaps: { name: string }[]) => gaps.map((g) => g.name);

describe("foundationGaps", () => {
  it("names the weak prerequisites of a term the reader is confused about", () => {
    const { w, needs, studied } = setup();
    const lora = studied("LoRA", "review_again");
    const rank = studied("Matrix rank", "review_again");
    const svd = studied("SVD", "review_good");
    needs(lora, rank);
    needs(lora, svd);
    expect(foundationGaps(w.state(), lora)).toMatchObject([{ name: "Matrix rank", reason: "confused" }]);
  });

  it("also fires for a shaky term, and reports prerequisites that are shaky or never looked up", () => {
    const { w, needs, studied } = setup();
    const lora = studied("LoRA", "review_hard");
    const rank = studied("Matrix rank", "review_hard");
    needs(lora, rank);
    needs(lora, w.concept("Low-rank structure")); // mentioned, never explained
    const gaps = foundationGaps(w.state(), lora);
    expect(gaps.map((g) => [g.name, g.reason])).toEqual([
      ["Matrix rank", "shaky"],
      ["Low-rank structure", "unstudied"],
    ]);
  });

  it("goes down to the weakest foundation instead of stopping at the first weak step", () => {
    const { w, needs, studied } = setup();
    const lora = studied("LoRA", "review_again");
    const rank = studied("Matrix rank", "review_again");
    const vectors = studied("Vector space", "review_again");
    needs(lora, rank);
    needs(rank, vectors);
    expect(names(foundationGaps(w.state(), lora))).toEqual(["Vector space"]);
  });

  it("is empty for a term that is understood or new, or when the prerequisites are fine", () => {
    const { w, needs, studied } = setup();
    const good = studied("LoRA", "review_good");
    const fresh = studied("QLoRA");
    const rank = studied("Matrix rank", "review_again");
    const solid = studied("SVD", "review_easy");
    const struggling = studied("DoRA", "review_again");
    needs(good, rank);
    needs(fresh, rank);
    needs(struggling, solid);
    const s = w.state();
    expect(foundationGaps(s, good)).toEqual([]);
    expect(foundationGaps(s, fresh)).toEqual([]);
    expect(foundationGaps(s, struggling)).toEqual([]);
  });

  it("ignores rejected or unlikely relations, muted prerequisites and cycles", () => {
    const { w, needs, studied } = setup();
    const a = studied("A", "review_again");
    const b = studied("B", "review_again");
    const c = studied("C", "review_again");
    needs(a, b, 0.1);
    needs(a, c);
    needs(c, a);
    w.events.push(w.f.make("concept.muted", { concept_id: c }));
    expect(foundationGaps(w.state(), a)).toEqual([]);
    needs(b, a);
    needs(a, b);
    expect(names(foundationGaps(w.state(), a))).toEqual(["B"]);
  });

  it("finds the same foundations whichever prerequisite is walked first", () => {
    const { w, needs, studied } = setup();
    const a = studied("A", "review_again");
    const b = studied("B", "review_again");
    const c = studied("C", "review_hard");
    const d = studied("D", "review_again");
    needs(a, b);
    needs(a, c);
    needs(b, d);
    needs(c, d);
    expect(names(foundationGaps(w.state(), a))).toEqual(["D"]);
  });

  it("stops at a prerequisite the reader grasps", () => {
    const { w, needs, studied } = setup();
    const lora = studied("LoRA", "review_again");
    const svd = studied("SVD", "review_good");
    const algebra = studied("Linear algebra", "review_again");
    needs(lora, svd);
    needs(svd, algebra);
    expect(foundationGaps(w.state(), lora)).toEqual([]);
  });

  it("says nothing for a muted term, and reports every gap", () => {
    const { w, needs, studied } = setup();
    const top = studied("Top", "review_again");
    const gapNames = ["G1", "G2", "G3", "G4"];
    for (const n of gapNames) needs(top, studied(n, "review_again"));
    expect(names(foundationGaps(w.state(), top))).toEqual(gapNames);
    w.events.push(w.f.make("concept.muted", { concept_id: top }));
    expect(foundationGaps(w.state(), top)).toEqual([]);
  });
});
