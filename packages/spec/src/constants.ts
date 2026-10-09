export const ENVELOPE_VERSION = 1 as const;

export const DOMAINS = ["ml", "systems", "networking", "security", "data", "math", "physics", "bio", "other"] as const;
export const TIERS = ["defined_in_source", "external_knowledge"] as const;
export const RELS = ["variant_of", "prerequisite", "related"] as const;
export const EDGE_SOURCES = ["llm_explain", "cooccurrence", "user", "external:cso", "external:wikidata", "commons"] as const;
export const ACTIONS = [
  "followed_up",
  "marked_understood",
  "marked_confused",
  "reunion_recalled",
  "reunion_reexplain",
  "reunion_compare",
  "review_again",
  "review_hard",
  "review_good",
  "review_easy",
] as const;
export const SENSITIVITIES = ["normal", "sensitive"] as const;
export const CONSENT_SCOPES = ["this_record", "this_source", "all_public_sources"] as const;
export const ENCOUNTER_FLAGS = ["card_missing"] as const;

export type Domain = (typeof DOMAINS)[number];
export type Tier = (typeof TIERS)[number];
export type Rel = (typeof RELS)[number];
export type EdgeSource = (typeof EDGE_SOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type Sensitivity = (typeof SENSITIVITIES)[number];
export type ConsentScope = (typeof CONSENT_SCOPES)[number];
export type EncounterFlag = (typeof ENCOUNTER_FLAGS)[number];

export const LIMITS = {
  maxEventBytes: 65536,
  maxBatchBytes: 1048576,
  maxBatchEvents: 1000,
} as const;

export const CARD_LIMITS = {
  maxNameLength: 80,
  maxAliases: 8,
  maxBroader: 1,
  maxVariants: 3,
  maxPrerequisites: 3,
  maxLlmConfidence: 0.8,
  maxExplanationLength: 20000,
  maxEvidenceLength: 1000,
  maxSelectionLength: 200,
  maxModelNameLength: 100,
} as const;
