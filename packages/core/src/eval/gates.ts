import type { EvalMetrics } from "./evaluate";

/** The lowest scores a release may measure. Clustering has no fixed floor: it must not fall below the recorded baseline. */
export const RELEASE_GATES = {
  reunionPrecision: 0.9,
  shownEdgePrecision: 0.85,
  definedInSourcePrecision: 0.9,
} as const;

export interface Baseline {
  bCubedF1: number;
}

export interface GateResult {
  name: string;
  measured: number | null;
  /** Null for the clustering gate until a baseline is recorded. */
  threshold: number | null;
  pass: boolean;
}

/** A gate with nothing measured fails: an empty sample says nothing about quality. */
export function checkGates(m: EvalMetrics, baseline?: Baseline): GateResult[] {
  const floor = (name: string, measured: number | null, threshold: number, slack = 0): GateResult => ({
    name,
    measured,
    threshold,
    pass: measured !== null && measured >= threshold - slack,
  });
  return [
    floor("reunion precision", m.reunionPrecision.value, RELEASE_GATES.reunionPrecision),
    floor("shown variant_of edge precision", m.shownEdgePrecision.value, RELEASE_GATES.shownEdgePrecision),
    floor("defined_in_source precision", m.definedInSourcePrecision.value, RELEASE_GATES.definedInSourcePrecision),
    baseline
      ? // Rounding in a stored baseline must not fail an identical run.
        floor("B-cubed F1 against baseline", m.clustering.f1, baseline.bCubedF1, 1e-9)
      : { name: "B-cubed F1 against baseline", measured: m.clustering.f1, threshold: null, pass: true },
  ];
}
