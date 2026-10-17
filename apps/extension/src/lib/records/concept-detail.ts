import { gradeOf, type State } from "@harkback/core";
import type { Domain, Rel } from "@harkback/spec";
import { isActiveEdge } from "../review/prerequisites";
import { historyEntries, type HistoryEntry } from "./history";

/** `shaky`: the last answer was "Hard", remembered only with effort. */
export type Understanding = "understood" | "shaky" | "confused" | "new";

export interface RelatedConcept {
  conceptId: string;
  name: string;
  /** Other names, so the link can be shown in the reader's language. */
  aliases: string[];
  /** True when the concept has at least one recorded explanation. */
  studied: boolean;
  /** The relation between the two concepts, so it can be confirmed or rejected. */
  edgeId: string;
  /** True once the reader confirmed the relation. */
  confirmed: boolean;
}

/** A relation the model proposed with too little confidence to be used until the reader confirms it. */
export interface SuggestedRelation extends RelatedConcept {
  rel: Rel;
}

export interface ConceptDetail {
  conceptId: string;
  name: string;
  aliases: string[];
  /** Names the model proposed (such as a translation) that match nothing until the reader accepts them. */
  suggestedNames: string[];
  domain: Domain;
  understanding: Understanding;
  muted: boolean;
  prerequisites: RelatedConcept[];
  variants: RelatedConcept[];
  related: RelatedConcept[];
  /** Weak relations, shown apart so the reader can confirm or reject them. */
  suggested: SuggestedRelation[];
  /** Newest first. */
  entries: HistoryEntry[];
}

type Edge = State["edges"] extends ReadonlyMap<string, infer E> ? E : never;

function groupFor<T>(groups: { prerequisites: T; variants: T; related: T }, rel: Rel): T {
  return rel === "prerequisite" ? groups.prerequisites : rel === "variant_of" ? groups.variants : groups.related;
}

/** The most recent decisive action across all encounters of the concept decides. */
export function understandingOf(state: State, conceptId: string): Understanding {
  const id = state.representative.get(conceptId) ?? conceptId;
  const actions = (state.encountersByConcept.get(id) ?? [])
    .flatMap((eid) => state.encounters.get(eid)?.actions ?? [])
    .filter((a) => gradeOf(a.action) !== null)
    .sort((a, b) => a.at - b.at);
  const last = actions.at(-1);
  if (!last) return "new";
  const grade = gradeOf(last.action);
  return grade === 1 ? "confused" : grade === 2 ? "shaky" : "understood";
}

export function conceptDetail(state: State, conceptId: string): ConceptDetail | null {
  const id = state.representative.get(conceptId) ?? conceptId;
  const concept = state.concepts.get(id);
  if (!concept || concept.isPlaceholder) return null;

  const groups = {
    prerequisites: new Map<string, RelatedConcept>(),
    variants: new Map<string, RelatedConcept>(),
    related: new Map<string, RelatedConcept>(),
  };
  const suggested = new Map<string, SuggestedRelation>();
  const related = (otherId: string, edge: Edge): RelatedConcept | null => {
    const other = state.concepts.get(otherId);
    if (!other || otherId === id) return null;
    return {
      conceptId: otherId,
      name: other.canonicalName,
      aliases: other.names.filter((n) => n !== other.canonicalName),
      studied: !other.isPlaceholder,
      edgeId: edge.id,
      confirmed: edge.status === "confirmed",
    };
  };
  const add = (group: Map<string, RelatedConcept>, otherId: string, edge: Edge): void => {
    const r = group.has(otherId) ? null : related(otherId, edge);
    if (r) group.set(otherId, r);
  };
  for (const edge of state.edges.values()) {
    if (edge.from !== id && edge.to !== id) continue;
    // A prerequisite is shown on the concept that needs it.
    if (edge.rel === "prerequisite" && edge.from !== id) continue;
    const other = edge.from === id ? edge.to : edge.from;
    if (!isActiveEdge(edge)) {
      const r = edge.status === "rejected" || suggested.has(`${edge.rel} ${other}`) ? null : related(other, edge);
      if (r) suggested.set(`${edge.rel} ${other}`, { ...r, rel: edge.rel });
      continue;
    }
    if (edge.rel === "prerequisite") add(groups.prerequisites, other, edge);
    else if (edge.rel === "variant_of") add(groups.variants, other, edge);
    else add(groups.related, other, edge);
  }

  return {
    conceptId: id,
    name: concept.canonicalName,
    aliases: concept.names.filter((n) => n !== concept.canonicalName),
    suggestedNames: [...concept.proposedAliases],
    domain: concept.domain,
    understanding: understandingOf(state, id),
    muted: concept.muted,
    prerequisites: [...groups.prerequisites.values()],
    variants: [...groups.variants.values()],
    related: [...groups.related.values()],
    // A weak relation to a concept already related in that way adds nothing.
    suggested: [...suggested.values()].filter((r) => !groupFor(groups, r.rel).has(r.conceptId)),
    entries: historyEntries(state, id),
  };
}
