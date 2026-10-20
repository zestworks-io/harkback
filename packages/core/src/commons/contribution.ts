import type { ConsentScope, Domain, Rel, Tier } from "@harkback/spec";
import { gradeOf } from "../review/grade";
import { isSensitiveSource, type EncounterState, type SourceState, type State } from "../events/state";
import { isOpenLicense } from "./license";

/** What a contribution may cover: one look-up, one paper, or every openly licensed paper. */
export interface ContributionScope {
  scope: ConsentScope;
  /** The encounter id for one look-up, the source id for one paper; null for all papers. */
  target: string | null;
}

export type ContributedUnderstanding = "confused" | "shaky" | "understood" | "unrated";

export interface ContributedRecord {
  /** `arxiv:<id>` or `doi:<doi>`; never an address, which can name the reader's own pages. */
  paper: string;
  license: string;
  term: string;
  domain: Domain;
  /** The section heading the term was met in, when the page had one. */
  section: string | null;
  tier: Tier;
  understanding: ContributedUnderstanding;
  /** Year and month only. */
  month: string;
}

export interface ContributedRelation {
  from: string;
  rel: Rel;
  to: string;
}

export interface Contribution {
  format: "harkback-commons";
  version: 1;
  records: ContributedRecord[];
  relations: ContributedRelation[];
}

const MAX_TERM = 80;

/** Code-point order, the same on every computer. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const MAX_SECTION = 80;

/** The paper id a contribution names a source by, or null when it is not a paper. */
function paperId(state: State, sourceId: string): string | null {
  const ids = state.sources.get(sourceId)?.ids;
  if (ids?.arxiv) return `arxiv:${ids.arxiv}`;
  if (ids?.doi) return `doi:${ids.doi}`;
  return null;
}

function understandingOf(e: EncounterState): ContributedUnderstanding {
  const grade = e.actions
    .map((a) => gradeOf(a.action))
    .filter((g) => g !== null)
    .at(-1);
  return grade === undefined ? "unrated" : grade === 1 ? "confused" : grade === 2 ? "shaky" : "understood";
}

/** Sources to treat as sensitive although the records do not say so, such as those a site rule covers. */
export type AlsoSensitive = (source: SourceState) => boolean;

/** Whether a source may be contributed: an openly licensed paper that nobody called sensitive. */
export function isContributable(state: State, sourceId: string, alsoSensitive: AlsoSensitive = () => false): boolean {
  const source = state.sources.get(sourceId);
  return (
    !!source &&
    isOpenLicense(source.license) &&
    paperId(state, sourceId) !== null &&
    !isSensitiveSource(state, sourceId) &&
    !alsoSensitive(source)
  );
}

/**
 * A contribution to the data commons, built on this computer. It holds no quote, explanation, address, device or exact time:
 * for each look-up in an openly licensed paper, the paper's id, the term, its field and section, how well it was understood,
 * and the month; and the relations you confirmed between the terms it contains, when found in those look-ups and on no sensitive page.
 */
export function buildContribution(state: State, scope: ContributionScope, alsoSensitive: AlsoSensitive = () => false): Contribution {
  const records: ContributedRecord[] = [];
  /** Representative concept id -> the term it is contributed as. */
  const included = new Map<string, string>();
  const contributed = new Set<string>();
  for (const e of state.encounters.values()) {
    if (scope.scope === "this_record" && e.id !== scope.target) continue;
    if (scope.scope === "this_source" && e.sourceId !== scope.target) continue;
    if (!isContributable(state, e.sourceId, alsoSensitive)) continue;
    const conceptId = state.representative.get(e.conceptId) ?? e.conceptId;
    const concept = state.concepts.get(conceptId);
    if (!concept) continue;
    included.set(conceptId, concept.canonicalName.slice(0, MAX_TERM));
    contributed.add(e.id);
    records.push({
      paper: paperId(state, e.sourceId)!,
      license: state.sources.get(e.sourceId)!.license,
      term: concept.canonicalName.slice(0, MAX_TERM),
      domain: concept.domain,
      section: e.locator.section?.slice(0, MAX_SECTION) || null,
      tier: e.explanation.tier,
      understanding: understandingOf(e),
      month: new Date(e.createdAt).toISOString().slice(0, 7),
    });
  }
  records.sort((a, b) => cmp(a.paper, b.paper) || cmp(a.term, b.term) || cmp(a.month, b.month));

  const notSensitive = (encounterId: string): boolean => {
    const source = state.sources.get(state.encounters.get(encounterId)?.sourceId ?? "");
    return !!source && !isSensitiveSource(state, source.id) && !alsoSensitive(source);
  };
  const relations: ContributedRelation[] = [];
  for (const edge of state.edges.values()) {
    // Only a relation found in a look-up contributed here, and never on a sensitive page (or one since deleted, which may have been).
    if (edge.status !== "confirmed" || !edge.evidenceEncounterIds.some((id) => contributed.has(id))) continue;
    if (!edge.evidenceEncounterIds.every((id) => notSensitive(id))) continue;
    const from = included.get(edge.from);
    const to = included.get(edge.to);
    if (from && to) relations.push({ from, rel: edge.rel, to });
  }
  relations.sort((a, b) => cmp(a.from, b.from) || cmp(a.rel, b.rel) || cmp(a.to, b.to));

  return { format: "harkback-commons", version: 1, records, relations };
}
