import { gradeOf, type State } from "@harkback/core";
import type { Domain } from "@harkback/spec";
import { isActiveEdge } from "./prerequisites";
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
  /** The relation between the two concepts, so it can be rejected. */
  edgeId: string;
}

export interface ConceptDetail {
  conceptId: string;
  name: string;
  aliases: string[];
  domain: Domain;
  understanding: Understanding;
  muted: boolean;
  prerequisites: RelatedConcept[];
  variants: RelatedConcept[];
  related: RelatedConcept[];
  /** Newest first. */
  entries: HistoryEntry[];
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
  const add = (group: Map<string, RelatedConcept>, otherId: string, edgeId: string): void => {
    const other = state.concepts.get(otherId);
    if (!other || otherId === id || group.has(otherId)) return;
    group.set(otherId, {
      conceptId: otherId,
      name: other.canonicalName,
      aliases: other.names.filter((n) => n !== other.canonicalName),
      studied: !other.isPlaceholder,
      edgeId,
    });
  };
  for (const edge of state.edges.values()) {
    if (edge.from !== id && edge.to !== id) continue;
    if (!isActiveEdge(edge)) continue;
    const other = edge.from === id ? edge.to : edge.from;
    if (edge.rel === "prerequisite") {
      if (edge.from === id) add(groups.prerequisites, other, edge.id);
    } else if (edge.rel === "variant_of") add(groups.variants, other, edge.id);
    else add(groups.related, other, edge.id);
  }

  return {
    conceptId: id,
    name: concept.canonicalName,
    aliases: concept.names.filter((n) => n !== concept.canonicalName),
    domain: concept.domain,
    understanding: understandingOf(state, id),
    muted: concept.muted,
    prerequisites: [...groups.prerequisites.values()],
    variants: [...groups.variants.values()],
    related: [...groups.related.values()],
    entries: historyEntries(state, id),
  };
}
