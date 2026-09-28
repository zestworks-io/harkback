export const DAY_MS = 86_400_000;

export const THRESHOLDS = {
  askUserSimilarity: 0.6,
  candidateMinSimilarity: 0.3,
  evidenceSimilarity: 0.9,
  relatedEdgeConfidence: 0.7,
} as const;

export const REUNION_DEFAULTS = { minGapDays: 3, maxPerPage: 3 } as const;

export const MATCH_RULES = { shortAcronymMaxLength: 4, cjkMinMatchLength: 3 } as const;

/** Keys are compared in lower case. Maintained from evaluation results. */
export const DEFAULT_AMBIGUOUS_ACRONYMS: ReadonlySet<string> = new Set(["sam", "rl", "moe", "gp"]);
