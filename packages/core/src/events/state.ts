import type {
  Action,
  ConsentScope,
  Domain,
  EdgeSource,
  EncounterFlag,
  Explanation,
  Locator,
  Rel,
  Sensitivity,
  SourceIds,
} from "@harkback/spec";
import { normalizeSourceId, parentSourceId } from "./source-identity";
import type { Script } from "../concepts/normalize";

export interface ConceptState {
  id: string;
  canonicalName: string;
  domain: Domain;
  /** Canonical name first, then aliases; unique by identityKey. */
  names: string[];
  /** Names the model proposed that the user has not yet confirmed or rejected. They do not match anything. */
  proposedAliases: string[];
  /** Names the user rejected, so they are not proposed again. */
  rejectedAliases: string[];
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
  /** The reader's own note, if any. */
  note?: string;
  /** Recorded without an explanation (imported from Zotero) and explained afterwards. */
  explainedLater?: true;
  /** When an encounter recorded without an explanation was explained; absent for one explained when it was recorded. */
  explainedAt?: number;
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
  /** Where in the log the latest record that made or kept it sensitive is, by the reader or not. */
  sensitiveAt?: number;
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
  /** Representative concept id -> ids of the sources where the reader said the term means something else. */
  dismissed: Map<string, string[]>;
  /** What the reader agreed to contribute to the data commons, oldest first. */
  consents: { scope: ConsentScope; target: string | null; at: number }[];
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

/** Root id of each paper or page with a source where `flagged` holds -> the latest `at` among them (-1 when none has one). */
function rootsLatest(
  state: SourceView,
  flagged: (s: SourceState) => boolean,
  at: (s: SourceState) => number | undefined,
): Map<string, number> {
  const roots = new Map<string, number>();
  for (const [id, src] of state.sources) {
    if (!flagged(src)) continue;
    const root = identityRoot(state, id);
    roots.set(root, Math.max(roots.get(root) ?? -1, at(src) ?? -1));
  }
  return roots;
}

interface SensitivityMarks {
  /** When the reader marked each sensitive root, -1 when it was only recorded so. */
  markedByReader: Map<string, number>;
  /** When each sensitive root was last recorded sensitive, by anyone. */
  recorded: Map<string, number>;
  /** When the reader said a root is fine. */
  fine: Map<string, number>;
}

function sensitivityMarks(state: SourceView): SensitivityMarks {
  const sensitive = (s: SourceState) => s.sensitivity === "sensitive";
  return {
    markedByReader: rootsLatest(state, sensitive, (s) => s.decidedAt),
    recorded: rootsLatest(state, sensitive, (s) => s.sensitiveAt),
    fine: rootsLatest(
      state,
      (s) => s.chosen === true && s.sensitivity === "normal",
      (s) => s.decidedAt,
    ),
  };
}

/**
 * Like `reaches` for sensitivity, except that a part the reader said is fine stops what the whole above it passes down, unless the
 * reader marked the whole after that. Between two ids of one paper the later record wins, as for a single id.
 */
function sensitiveThrough(state: SourceView, marks: SensitivityMarks, id: string): boolean {
  let exemptAt: number | undefined;
  for (let cur: string | null = id; cur !== null; cur = parentSourceId(cur)) {
    const root = identityRoot(state, cur);
    const recorded = marks.recorded.get(root);
    const fineHere = marks.fine.get(root);
    if (recorded !== undefined) {
      if (fineHere !== undefined) return fineHere < recorded;
      return !(exemptAt !== undefined && exemptAt > (marks.markedByReader.get(root) ?? -1));
    }
    exemptAt ??= fineHere;
  }
  return false;
}

/** True when the source, or the same paper under its other id, or the repository an issue or pull request belongs to, is marked sensitive. */
export function isSensitiveSource(state: SourceView, sourceId: string): boolean {
  return sensitiveThrough(state, sensitivityMarks(state), sourceId);
}

/** Every recorded source for which `isSensitiveSource` holds, found in one pass. */
export function sensitiveSourceIds(state: SourceView): Set<string> {
  const marks = sensitivityMarks(state);
  return new Set([...state.sources.keys()].filter((id) => sensitiveThrough(state, marks, id)));
}

/** True when the reader chose the sensitivity of the source, its paper's other id, or its repository. */
export function isChosenSource(state: SourceView, sourceId: string): boolean {
  return reaches(
    state,
    rootsWhere(state, (s) => s.chosen === true),
    sourceId,
  );
}
