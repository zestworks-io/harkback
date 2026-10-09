import { gradeOf, THRESHOLDS, type State } from "@harkback/core";
import type { Rel } from "@harkback/spec";
import { understandingOf, type Understanding } from "./concept-detail";

/** A half-open span of time: `start` is included, `end` is not. */
export interface WeekRange {
  start: number;
  end: number;
}

/** The week (Monday to Sunday, local time) that holds `now`, moved by `offsetWeeks` (-1 is last week). */
export function weekOf(now: number, offsetWeeks = 0): WeekRange {
  const d = new Date(now);
  const sinceMonday = (d.getDay() + 6) % 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday + 7 * offsetWeeks);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
}

export interface DigestConcept {
  conceptId: string;
  name: string;
  understanding: Understanding;
  /** How many times it was looked up this week. */
  lookups: number;
  /** First time this term was ever looked up, and it was this week. */
  fresh: boolean;
}

export interface DigestSource {
  sourceId: string;
  title: string;
  lookups: number;
}

export interface DigestConnection {
  edgeId: string;
  rel: Rel;
  from: { id: string; name: string };
  to: { id: string; name: string };
}

export interface Digest {
  range: WeekRange;
  /** Terms looked up this week, new ones first and then by how often they came up. */
  met: DigestConcept[];
  freshCount: number;
  revisitedCount: number;
  /** Terms looked up in the week before, for comparison. */
  previousMet: number;
  remembered: number;
  /** Answered "Hard": recalled only with effort. */
  shaky: number;
  confused: number;
  /** Days of the week with a look-up or an answer. */
  activeDays: number;
  /** Terms you are currently confused about, most recently touched first. */
  stillConfused: (DigestConcept | { conceptId: string; name: string; understanding: Understanding; lookups: 0; fresh: false })[];
  sources: DigestSource[];
  connections: DigestConnection[];
  isEmpty: boolean;
}

const inRange = (t: number, r: WeekRange): boolean => t >= r.start && t < r.end;
const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export interface DigestLimits {
  concepts?: number;
  confused?: number;
  sources?: number;
  connections?: number;
}

/** What happened in one week, from the records alone: nothing here calls a model. */
export function buildDigest(state: State, range: WeekRange, limits: DigestLimits = {}): Digest {
  const rep = (id: string): string => state.representative.get(id) ?? id;
  const previous: WeekRange = { start: weekOf(range.start - 1).start, end: range.start };

  const lookups = new Map<string, number>();
  const firstLookup = new Map<string, number>();
  const bySource = new Map<string, number>();
  const prevConcepts = new Set<string>();
  const days = new Set<string>();
  let remembered = 0;
  let shaky = 0;
  let confused = 0;
  const lastTouch = new Map<string, number>();

  for (const e of state.encounters.values()) {
    const id = rep(e.conceptId);
    firstLookup.set(id, Math.min(firstLookup.get(id) ?? Infinity, e.createdAt));
    lastTouch.set(id, Math.max(lastTouch.get(id) ?? 0, e.createdAt, e.lastTouchedAt));
    if (inRange(e.createdAt, previous)) prevConcepts.add(id);
    if (inRange(e.createdAt, range)) {
      lookups.set(id, (lookups.get(id) ?? 0) + 1);
      bySource.set(e.sourceId, (bySource.get(e.sourceId) ?? 0) + 1);
      days.add(dayKey(e.createdAt));
    }
    for (const a of e.actions) {
      if (!inRange(a.at, range)) continue;
      days.add(dayKey(a.at));
      const grade = gradeOf(a.action);
      if (grade === 1) confused++;
      else if (grade === 2) shaky++;
      else if (grade !== null) remembered++;
    }
  }

  const concept = (id: string): DigestConcept | null => {
    const c = state.concepts.get(id);
    if (!c || c.isPlaceholder) return null;
    return {
      conceptId: id,
      name: c.canonicalName,
      understanding: understandingOf(state, id),
      lookups: lookups.get(id) ?? 0,
      fresh: inRange(firstLookup.get(id) ?? Infinity, range),
    };
  };

  const all = [...lookups.keys()].flatMap((id) => concept(id) ?? []);
  all.sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.lookups - a.lookups || a.name.localeCompare(b.name, "en"));
  const freshCount = all.filter((c) => c.fresh).length;

  const stillConfused = [...state.concepts.values()]
    .filter((c) => !c.isPlaceholder && !c.muted && understandingOf(state, c.id) === "confused")
    .sort((a, b) => (lastTouch.get(b.id) ?? 0) - (lastTouch.get(a.id) ?? 0) || a.canonicalName.localeCompare(b.canonicalName, "en"))
    .slice(0, limits.confused ?? 8)
    .flatMap((c) => concept(c.id) ?? []);

  const sources = [...bySource.entries()]
    .map(([sourceId, n]) => ({ sourceId, title: state.sources.get(sourceId)?.title || sourceId, lookups: n }))
    .sort((a, b) => b.lookups - a.lookups || a.title.localeCompare(b.title, "en"))
    .slice(0, limits.sources ?? 5);

  // A relation is new this week when the first look-up that supports it happened this week.
  const connections: DigestConnection[] = [];
  for (const edge of state.edges.values()) {
    if (edge.status === "rejected" || (edge.status !== "confirmed" && edge.confidence < THRESHOLDS.relatedEdgeConfidence)) continue;
    const evidence = edge.evidenceEncounterIds.flatMap((id) => state.encounters.get(id)?.createdAt ?? []);
    if (evidence.length === 0 || !inRange(Math.min(...evidence), range)) continue;
    const from = state.concepts.get(rep(edge.from));
    const to = state.concepts.get(rep(edge.to));
    if (!from || !to || from.id === to.id) continue;
    connections.push({
      edgeId: edge.id,
      rel: edge.rel,
      from: { id: from.id, name: from.canonicalName },
      to: { id: to.id, name: to.canonicalName },
    });
  }
  connections.sort((a, b) => a.from.name.localeCompare(b.from.name, "en") || a.to.name.localeCompare(b.to.name, "en"));

  return {
    range,
    met: all.slice(0, limits.concepts ?? 30),
    freshCount,
    revisitedCount: all.length - freshCount,
    previousMet: prevConcepts.size,
    remembered,
    shaky,
    confused,
    activeDays: days.size,
    stillConfused,
    sources,
    connections: connections.slice(0, limits.connections ?? 10),
    isEmpty: all.length === 0 && remembered === 0 && shaky === 0 && confused === 0,
  };
}
