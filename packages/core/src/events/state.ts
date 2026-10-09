import type { Action, Domain, EdgeSource, EncounterFlag, Explanation, Locator, Rel, Sensitivity, SourceIds } from "@harkback/spec";
import { normalizeSourceId, parentSourceId } from "./source-identity";
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
  /** True once the reader has chosen the sensitivity themselves, whichever way; an automatic record never sets it. */
  chosen?: true;
  /** Where in the log the reader last decided about it; a later decision about a part beats an earlier one about the whole. */
  decidedAt?: number;
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

type SourceView = Pick<State, "sources" | "sourceIdentity">;

/** The id that all spellings of one paper share. */
function identityRoot(state: SourceView, id: string): string {
  const k = normalizeSourceId(id);
  return state.sourceIdentity.get(k) ?? k;
}

function rootsWhere(state: SourceView, flagged: (s: SourceState) => boolean): Set<string> {
  const roots = new Set<string>();
  for (const [id, src] of state.sources) if (flagged(src)) roots.add(identityRoot(state, id));
  return roots;
}

/** Whether `id`, its paper under another id, or a repository above it is among `roots`. */
function reaches(state: SourceView, roots: ReadonlySet<string>, id: string): boolean {
  for (let cur: string | null = id; cur !== null; cur = parentSourceId(cur)) if (roots.has(identityRoot(state, cur))) return true;
  return false;
}

/**
 * Like `reaches` for sensitivity, except that a part the reader said is fine stops what the whole above it passes down, unless the
 * reader marked the whole after that.
 */
function sensitiveThrough(state: SourceView, roots: ReadonlySet<string>, id: string): boolean {
  let exemption: SourceState | undefined;
  for (let cur: string | null = id; cur !== null; cur = parentSourceId(cur)) {
    if (roots.has(identityRoot(state, cur))) {
      const markedAt = state.sources.get(cur)?.decidedAt ?? -1;
      return !(exemption && (exemption.decidedAt ?? -1) > markedAt);
    }
    const own = state.sources.get(cur);
    if (!exemption && own?.chosen && own.sensitivity === "normal") exemption = own;
  }
  return false;
}

/** True when the source, or the same paper under its other id, or the repository an issue or pull request belongs to, is marked sensitive. */
export function isSensitiveSource(state: SourceView, sourceId: string): boolean {
  return sensitiveThrough(
    state,
    rootsWhere(state, (s) => s.sensitivity === "sensitive"),
    sourceId,
  );
}

/** Every recorded source for which `isSensitiveSource` holds, found in one pass. */
export function sensitiveSourceIds(state: SourceView): Set<string> {
  const roots = rootsWhere(state, (s) => s.sensitivity === "sensitive");
  return new Set([...state.sources.keys()].filter((id) => sensitiveThrough(state, roots, id)));
}

/** True when the reader chose the sensitivity of the source, its paper's other id, or its repository. */
export function isChosenSource(state: SourceView, sourceId: string): boolean {
  return reaches(
    state,
    rootsWhere(state, (s) => s.chosen === true),
    sourceId,
  );
}
