import type { HarkEvent } from "@harkback/spec";

export function compareEvents(a: HarkEvent, b: HarkEvent): number {
  const ta = Date.parse(a.ts);
  const tb = Date.parse(b.ts);
  if (ta !== tb) return ta - tb;
  if (a.device !== b.device) return a.device < b.device ? -1 : 1;
  if (a.seq !== b.seq) return a.seq - b.seq;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function canonicalOrder(events: readonly HarkEvent[]): HarkEvent[] {
  const sorted = [...events].sort(compareEvents);
  const seen = new Set<string>();
  const out: HarkEvent[] = [];
  for (const e of sorted) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}
