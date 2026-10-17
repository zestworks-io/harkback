import { describe, expect, it } from "vitest";
import {
  bCubed,
  definedInSourcePrecision,
  evidenceVerificationRate,
  ratio,
  relationJudge,
  reunionPrecision,
  sameConceptPrecision,
} from "../../src/eval/metrics";

describe("ratio", () => {
  it("has no value when nothing was judged", () => {
    expect(ratio(0, 0)).toEqual({ hits: 0, total: 0, value: null });
    expect(ratio(3, 4).value).toBe(0.75);
  });
});

describe("definedInSourcePrecision", () => {
  it("judges only explanations recorded as defined in the source", () => {
    const r = definedInSourcePrecision([
      { tier: "defined_in_source", defined: true },
      { tier: "defined_in_source", defined: false },
      { tier: "external_knowledge", defined: true },
      { tier: "external_knowledge", defined: false },
    ]);
    expect(r).toEqual({ hits: 1, total: 2, value: 0.5 });
  });
});

describe("evidenceVerificationRate", () => {
  it("judges only answers that quote evidence", () => {
    const r = evidenceVerificationRate([
      { evidence: "a quote", verified: true },
      { evidence: "made up", verified: false },
      { evidence: null, verified: false },
    ]);
    expect(r).toEqual({ hits: 1, total: 2, value: 0.5 });
  });
});

describe("relationJudge", () => {
  const judge = relationJudge([
    { from: "qlora", rel: "variant_of", to: "lora" },
    { from: "lora", rel: "variant_of", to: "peft" },
    { from: "lora", rel: "prerequisite", to: "rank" },
    { from: "rank", rel: "prerequisite", to: "matrix" },
  ]);

  it("accepts a listed relation", () => {
    expect(judge({ from: "qlora", rel: "variant_of", to: "lora" })).toBe(true);
    expect(judge({ from: "lora", rel: "prerequisite", to: "rank" })).toBe(true);
  });

  it("reads variant_of through intermediate kinds, but not prerequisites", () => {
    expect(judge({ from: "qlora", rel: "variant_of", to: "peft" })).toBe(true);
    expect(judge({ from: "lora", rel: "prerequisite", to: "matrix" })).toBe(false);
  });

  it("rejects a reversed relation and an unlabelled end", () => {
    expect(judge({ from: "lora", rel: "variant_of", to: "qlora" })).toBe(false);
    expect(judge({ from: "qlora", rel: "variant_of", to: null })).toBe(false);
    expect(judge({ from: null, rel: "prerequisite", to: "rank" })).toBe(false);
  });

  it("terminates on a cycle in the gold relations", () => {
    const cyclic = relationJudge([
      { from: "a", rel: "variant_of", to: "b" },
      { from: "b", rel: "variant_of", to: "a" },
    ]);
    expect(cyclic({ from: "a", rel: "variant_of", to: "c" })).toBe(false);
  });
});

describe("sameConceptPrecision", () => {
  it("counts joins to the right concept", () => {
    const r = sameConceptPrecision([
      { predicted: "lora", gold: "lora" },
      { predicted: "prefix_tuning", gold: "prompt_tuning" },
      { predicted: null, gold: "peft" },
    ]);
    expect(r.hits).toBe(1);
    expect(r.total).toBe(3);
  });
});

describe("reunionPrecision", () => {
  it("counts reunions the page should show", () => {
    const r = reunionPrecision([
      { label: "lora", expected: ["lora", "adapter"] },
      { label: "peft", expected: ["lora"] },
      { label: null, expected: ["lora"] },
    ]);
    expect(r.hits).toBe(1);
    expect(r.total).toBe(3);
  });
});

describe("bCubed", () => {
  it("is perfect when the clusters match, whatever their names", () => {
    expect(
      bCubed([
        { predicted: "1", gold: "a" },
        { predicted: "1", gold: "a" },
        { predicted: "2", gold: "b" },
      ]),
    ).toEqual({ precision: 1, recall: 1, f1: 1 });
  });

  it("loses precision for a false merge and recall for a missed one", () => {
    const s = bCubed([
      { predicted: "A", gold: "x" },
      { predicted: "A", gold: "x" },
      { predicted: "A", gold: "y" },
      { predicted: "B", gold: "y" },
    ]);
    expect(s.precision).toBeCloseTo(2 / 3);
    expect(s.recall).toBeCloseTo(3 / 4);
    expect(s.f1).toBeCloseTo(12 / 17);
  });

  it("scores an empty set as zero", () => {
    expect(bCubed([])).toEqual({ precision: 0, recall: 0, f1: 0 });
  });
});
