import type { HarkEvent } from "@harkback/spec";

/** Clears the payloads of deleted encounters and their actions; keeps ids, order and tombstones. */
export function compactDeleted(events: readonly HarkEvent[]): HarkEvent[] {
  const deleted = new Set(events.flatMap((e) => (e.type === "encounter.deleted" ? [e.payload.encounter_id] : [])));
  return events.map((e) => {
    if ((e.type === "encounter.created" || e.type === "encounter.action") && e.payload && deleted.has(e.payload.encounter_id)) {
      return { ...e, payload: null };
    }
    return e;
  });
}
