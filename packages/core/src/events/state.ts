import type { Action, Domain, EdgeSource, EncounterFlag, Explanation, Locator, Rel, Sensitivity, SourceIds } from "@harkback/spec";
import { normalizeSourceId } from "./source-identity";
import type { Script } from "../concepts/normalize";

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
  /** Source id -> representative id of the paper it belongs to; ids that name the same paper (arXiv and DOI) share one. */
  sourceIdentity: Map<string, string>;
  edges: Map<string, EdgeState>;
  warnings: string[];
}

/** True when both source ids name the same source, directly or through a paper's other id. */
export function sameSource(state: Pick<State, "sourceIdentity">, a: string, b: string): boolean {
  if (a === b) return true;
  const ka = normalizeSourceId(a);
  const kb = normalizeSourceId(b);
  return (state.sourceIdentity.get(ka) ?? ka) === (state.sourceIdentity.get(kb) ?? kb);
}

/** True when the source, or the same paper under its other id, is marked sensitive. */
export function isSensitiveSource(state: Pick<State, "sources" | "sourceIdentity">, sourceId: string): boolean {
  if (state.sources.get(sourceId)?.sensitivity === "sensitive") return true;
  const k = normalizeSourceId(sourceId);
  const root = state.sourceIdentity.get(k) ?? k;
  for (const [id, src] of state.sources) {
    if (src.sensitivity !== "sensitive") continue;
    const ik = normalizeSourceId(id);
    if ((state.sourceIdentity.get(ik) ?? ik) === root) return true;
  }
  return false;
}
