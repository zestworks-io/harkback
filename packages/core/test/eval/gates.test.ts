import { describe, expect, it } from "vitest";
import type { EvalMetrics } from "../../src/eval/evaluate";
import { checkGates } from "../../src/eval/gates";
import { ratio } from "../../src/eval/metrics";

const metrics = (o: Partial<EvalMetrics> = {}): EvalMetrics => ({
  reunionPrecision: ratio(9, 10),
  reunionRecall: ratio(1, 2),
  shownEdgePrecision: ratio(17, 20),
  prerequisitePrecision: ratio(0, 1),
  definedInSourcePrecision: ratio(9, 10),
  evidenceVerification: ratio(0, 1),
  sameConceptPrecision: ratio(0, 1),
  clustering: { precision: 0.8, recall: 0.8, f1: 0.8 },
  ...o,
});
const failing = (o: Partial<EvalMetrics>, baseline?: { bCubedF1: number }) =>
  checkGates(metrics(o), baseline)
    .filter((g) => !g.pass)
    .map((g) => g.name);

describe("checkGates", () => {
  it("passes at exactly the thresholds, with no baseline recorded yet", () => {
    expect(failing({})).toEqual([]);
  });

  it("fails each gate below its threshold", () => {
    expect(failing({ reunionPrecision: ratio(8, 10) })).toEqual(["reunion precision"]);
    expect(failing({ shownEdgePrecision: ratio(16, 20) })).toEqual(["shown variant_of edge precision"]);
    expect(failing({ definedInSourcePrecision: ratio(8, 10) })).toEqual(["defined_in_source precision"]);
  });

  it("fails a gate with nothing measured", () => {
    expect(failing({ reunionPrecision: ratio(0, 0) })).toEqual(["reunion precision"]);
  });

  it("fails when clustering drops below the baseline, and passes when it holds", () => {
    expect(failing({}, { bCubedF1: 0.81 })).toEqual(["B-cubed F1 against baseline"]);
    expect(failing({}, { bCubedF1: 0.8 })).toEqual([]);
    expect(failing({ clustering: { precision: 0.7, recall: 0.7, f1: 0.7 } })).toEqual([]);
  });
});
