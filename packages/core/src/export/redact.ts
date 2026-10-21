import type { HarkEvent } from "@harkback/spec";
import { identityKey } from "../concepts/normalize";
import { parseEdgeId } from "../events/ids";
import { isSensitiveOnly } from "../llm/prompt";
import { replay } from "../events/replay";
import { isSensitiveSource, sensitiveSourceIds, type SourceState } from "../events/state";

/**
 * The events without anything that came from a sensitive source: the source itself, its encounters and what was done to
 * them, and the concepts and relations known only from such sources. A concept that was also met in a normal source stays.
 * `alsoSensitive` marks further sources as sensitive, for rules that are not part of the records.
 */
export function withoutSensitive(events: readonly HarkEvent[], alsoSensitive: (source: SourceState) => boolean = () => false): HarkEvent[] {
  const replayed = replay(events);
  // A source the reader's site rules call sensitive counts as sensitive even if it was recorded before the rule existed.
  const sources = new Map(
    [...replayed.sources].map(([id, s]): [string, SourceState] => [
      id,
      s.sensitivity !== "sensitive" && alsoSensitive(s) ? { ...s, sensitivity: "sensitive" } : s,
    ]),
  );
  const state = { ...replayed, sources };
  const sensitiveSources = sensitiveSourceIds(state);
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

  // A name split off on its own makes a concept with no look-up, which is left out because nothing says where it came from;
  // the name then stays on the concept it was taken from, instead of being lost from both.
  const namesOnly = new Set<string>();
  for (const id of hidden) {
    const c = state.concepts.get(id)!;
    const related = [...state.edges.values()].some((e) => e.from === id || e.to === id);
    if (!state.encountersByConcept.get(id)?.length && !related) for (const n of c.names) namesOnly.add(identityKey(n));
  }

  // A decision about a name that was proposed from a sensitive page carries the same text, so it goes with the proposal.
  const hiddenNames = new Set<string>();
  for (const e of events) {
    if (e.type === "concept.alias_proposed" && (isHidden(e.payload.concept_id) || sensitiveEncounters.has(e.payload.evidence.encounter_id)))
      hiddenNames.add(identityKey(e.payload.alias));
  }

  return events.filter((e) => {
    switch (e.type) {
      case "source.seen":
        return !sensitiveSources.has(e.payload.source_id);
      case "encounter.created":
        return !e.payload || !sensitiveEncounters.has(e.payload.encounter_id);
      case "encounter.action":
      case "encounter.noted":
      case "encounter.explained":
        return !e.payload || !sensitiveEncounters.has(e.payload.encounter_id);
      case "encounter.deleted":
        return !sensitiveEncounters.has(e.payload.encounter_id);
      case "reunion.dismissed":
        return !isSensitiveSource(state, e.payload.source_id) && !isHidden(e.payload.concept_id);
      case "concept.alias_confirmed":
      case "concept.alias_rejected":
        if (hiddenNames.has(identityKey(e.payload.alias))) return false;
        return !isHidden(e.payload.concept_id);
      case "concept.alias_removed":
        return !isHidden(e.payload.concept_id) && !namesOnly.has(identityKey(e.payload.alias));
      case "concept.created":
      case "concept.alias_added":
      case "concept.muted":
      case "concept.unmuted":
        return !isHidden(e.payload.concept_id);
      case "concept.merged":
      case "concept.unmerged":
        return !isHidden(e.payload.from) && !isHidden(e.payload.into);
      case "encounter.moved":
        return !sensitiveEncounters.has(e.payload.encounter_id) && !isHidden(e.payload.concept_id);
      case "concept.alias_proposed":
        return !isHidden(e.payload.concept_id) && !sensitiveEncounters.has(e.payload.evidence.encounter_id);
      case "edge.proposed": {
        const p = e.payload;
        return !isHidden(p.from) && !isHidden(p.to) && !(p.evidence.encounter_id && sensitiveEncounters.has(p.evidence.encounter_id));
      }
      case "contribution.consent":
        // Agreeing to contribute one look-up or one source names it.
        return !(e.payload.target && (isSensitiveSource(state, e.payload.target) || sensitiveEncounters.has(e.payload.target)));
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
