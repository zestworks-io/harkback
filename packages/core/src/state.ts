import type { Action, Domain, EdgeSource, EncounterFlag, Explanation, Locator, Rel, Sensitivity, SourceIds } from "@harkback/spec";
import type { Script } from "./normalize";

export interface ConceptState {
  id: string;
  canonicalName: string;
  domain: Domain;
  /** Canonical name first, then aliases; unique by identityKey. */
  names: string[];
  /** All concept ids merged into this representative, sorted. */
  members: string[];
  muted: boolean;
  /** Derived: true when no non-deleted encounter belongs to this concept. */
  isPlaceholder: boolean;
}

export interface AliasInfo {
  key: string;
  norm: string;
  script: Script;
  display: string;
  conceptIds: string[];
  ambiguous: boolean;
  /** True when no concept has this name; it is the abbreviation of a multi-word name ("LLM" for "Large Language Model"). */
  derived?: boolean;
}

export interface EncounterAction {
  action: Action;
  at: number;
  detail?: { question?: string; answer?: string };
}

export interface EncounterState {
  id: string;
  conceptId: string;
  sourceId: string;
  locator: Locator;
  selection: string;
  explanation: Explanation;
  flags: EncounterFlag[];
  device: string;
  createdAt: number;
  actions: EncounterAction[];
  lastAction: Action | null;
  lastTouchedAt: number;
  everConfused: boolean;
}

export interface SourceState {
  id: string;
  ids: SourceIds;
  title: string;
  license: string;
  sensitivity: Sensitivity;
}

export type EdgeStatus = "proposed" | "confirmed" | "rejected";

export interface EdgeState {
  id: string;
  from: string;
  rel: Rel;
  to: string;
  status: EdgeStatus;
  confidence: number;
  sources: EdgeSource[];
  evidenceEncounterIds: string[];
}

export interface State {
  concepts: Map<string, ConceptState>;
  /** Every known concept id (including merged ones) -> representative id. */
  representative: Map<string, string>;
  /** identityKey -> alias info. */
  aliases: Map<string, AliasInfo>;
  encounters: Map<string, EncounterState>;
  /** Representative concept id -> encounter ids ordered by createdAt. */
  encountersByConcept: Map<string, string[]>;
  sources: Map<string, SourceState>;
  edges: Map<string, EdgeState>;
  warnings: string[];
}
