import { THRESHOLDS, type State } from "@harkback/core";
import type { Action, Domain } from "@harkback/spec";
import { historyEntries, type HistoryEntry } from "./history";

export type Understanding = "understood" | "confused" | "new";

export interface RelatedConcept {
  conceptId: string;
  name: string;
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

const DECISIVE: ReadonlySet<Action> = new Set(["marked_understood", "marked_confused", "reunion_recalled"]);

/** The most recent decisive action across all encounters of the concept decides. */
export function understandingOf(state: State, conceptId: string): Understanding {
  const id = state.representative.get(conceptId) ?? conceptId;
  const actions = (state.encountersByConcept.get(id) ?? [])
    .flatMap((eid) => state.encounters.get(eid)?.actions ?? [])
    .filter((a) => DECISIVE.has(a.action))
    .sort((a, b) => a.at - b.at);
  const last = actions.at(-1);
  if (!last) return "new";
  return last.action === "marked_confused" ? "confused" : "understood";
}

export function conceptDetail(state: State, conceptId: string): ConceptDetail | null {
  const id = state.representative.get(conceptId) ?? conceptId;
  const concept = state.concepts.get(id);
  if (!concept || concept.isPlaceholder) return null;

  const groups = { prerequisites: new Map<string, RelatedConcept>(), variants: new Map<string, RelatedConcept>(), related: new Map<string, RelatedConcept>() };
  const add = (group: Map<string, RelatedConcept>, otherId: string, edgeId: string): void => {
    const other = state.concepts.get(otherId);
    if (!other || otherId === id || group.has(otherId)) return;
    group.set(otherId, { conceptId: otherId, name: other.canonicalName, studied: !other.isPlaceholder, edgeId });
  };
  for (const edge of state.edges.values()) {
    if (edge.from !== id && edge.to !== id) continue;
    if (edge.status === "rejected") continue;
    if (edge.status !== "confirmed" && edge.confidence < THRESHOLDS.relatedEdgeConfidence) continue;
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
