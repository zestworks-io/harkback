import type { HarkEvent } from "@harkback/spec";
import { parseEdgeId } from "./ids";
import { isSensitiveOnly } from "./prompt";
import { replay } from "./replay";

/**
 * The events without anything that came from a sensitive source: the source itself, its encounters and what was done to
 * them, and the concepts and relations known only from such sources. A concept that was also met in a normal source stays.
 */
export function withoutSensitive(events: readonly HarkEvent[]): HarkEvent[] {
  const state = replay(events);
  const sensitiveSources = new Set([...state.sources.values()].filter((s) => s.sensitivity === "sensitive").map((s) => s.id));
  if (sensitiveSources.size === 0) return [...events];

  const sensitiveEncounters = new Set<string>();
  for (const e of events) {
    if (e.type === "encounter.created" && e.payload && sensitiveSources.has(e.payload.source_id))
      sensitiveEncounters.add(e.payload.encounter_id);
  }
  const hidden = new Set<string>();
  for (const [id, concept] of state.concepts) if (isSensitiveOnly(state, concept.id)) hidden.add(id);
  const isHidden = (conceptId: string): boolean => {
    const rep = state.representative.get(conceptId);
    return rep === undefined || hidden.has(rep);
  };

  return events.filter((e) => {
    switch (e.type) {
      case "source.seen":
        return !sensitiveSources.has(e.payload.source_id);
      case "encounter.created":
        return !e.payload || !sensitiveEncounters.has(e.payload.encounter_id);
      case "encounter.action":
        return !e.payload || !sensitiveEncounters.has(e.payload.encounter_id);
      case "encounter.deleted":
        return !sensitiveEncounters.has(e.payload.encounter_id);
      case "concept.created":
      case "concept.alias_added":
      case "concept.muted":
      case "concept.unmuted":
        return !isHidden(e.payload.concept_id);
      case "concept.merged":
        return !isHidden(e.payload.from) && !isHidden(e.payload.into);
      case "edge.proposed": {
        const p = e.payload;
        return !isHidden(p.from) && !isHidden(p.to) && !(p.evidence.encounter_id && sensitiveEncounters.has(p.evidence.encounter_id));
      }
      case "edge.confirmed":
      case "edge.rejected": {
        const parsed = parseEdgeId(e.payload.edge_id);
        return !parsed || (!isHidden(parsed.from) && !isHidden(parsed.to));
      }
      default:
        return true;
    }
  });
}
