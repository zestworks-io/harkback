import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate, replayRecording, type Recording } from "../../src/eval/evaluate";
import { checkGates } from "../../src/eval/gates";
import { EVAL_SET } from "./cases";

/** Answers built from the gold labels, with one mistake of each kind the metrics should catch. */
const recorded = JSON.parse(readFileSync(new URL("./fixtures/recorded.json", import.meta.url), "utf8")) as Recording;

describe("evaluate", () => {
  it("scores recorded answers without the model", async () => {
    const { metrics, misses } = await evaluate(EVAL_SET, replayRecording(recorded));
    expect(misses).toEqual([
      'prefix#2: "Prompt tuning" joined to "prefix tuning"',
      "gptq#2: evidence not found on the page",
      'adalora#2: "singular value decomposition" recorded as defined in the source',
      'edge: "weight-decomposed low-rank adaptation" variant_of "quantized low-rank adaptation" (dora variant_of qlora)',
    ]);
    expect(metrics.reunionPrecision).toEqual({ hits: 19, total: 19, value: 1 });
    expect(metrics.reunionRecall).toEqual({ hits: 19, total: 19, value: 1 });
    expect(metrics.definedInSourcePrecision).toEqual({ hits: 15, total: 16, value: 15 / 16 });
    expect(metrics.evidenceVerification).toEqual({ hits: 16, total: 17, value: 16 / 17 });
    expect(metrics.sameConceptPrecision).toEqual({ hits: 13, total: 14, value: 13 / 14 });
    expect(metrics.shownEdgePrecision).toEqual({ hits: 18, total: 19, value: 18 / 19 });
    expect(metrics.prerequisitePrecision.value).toBe(1);
    // The false join puts two of the 24 lookups in one cluster.
    expect(metrics.clustering.precision).toBeCloseTo(23 / 24);
    expect(metrics.clustering.recall).toBe(1);
    expect(checkGates(metrics).every((g) => g.pass)).toBe(true);
  });

  it("refuses a recording that has no answer for a lookup", async () => {
    await expect(evaluate(EVAL_SET, replayRecording({ model: "m", outputs: {} }))).rejects.toThrow("no answer for lora#1");
  });
});
