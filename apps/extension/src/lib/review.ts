import { DAY_MS, type State } from "@harkback/core";
import type { Action } from "@harkback/spec";
import { understandingOf, type Understanding } from "./concept-detail";

/** Days to wait after 1, 2, 3 ... consecutive successful reviews; the last step repeats. */
const LADDER_DAYS = [3, 7, 14, 30, 60] as const;
const RETRY_DAYS = 1;

const DECISIVE: ReadonlySet<Action> = new Set(["marked_understood", "marked_confused", "reunion_recalled"]);

export interface ReviewItem {
  conceptId: string;
  name: string;
  aliases: string[];
  understanding: Understanding;
  dueAt: number;
  /** Consecutive successful reviews; the next answer of "remembered" moves it up one step. */
  streak: number;
  /** The encounter a review answer is recorded on: the concept's latest one. */
  encounterId: string;
  selection: string;
  explanation: string;
  sourceTitle: string;
}

/** Days to wait before the next review after `streak` consecutive successful reviews (0 after a "still confused"). */
export function intervalDays(streak: number): number {
  return streak === 0 ? RETRY_DAYS : LADDER_DAYS[Math.min(streak, LADDER_DAYS.length) - 1]!;
}

interface Schedule {
  dueAt: number;
  streak: number;
}

/** When a concept is next due, from its answers: the last answer (or the latest look-up) plus the wait for its streak. */
function scheduleOf(
  state: State,
  concept: { id: string; isPlaceholder: boolean; muted: boolean },
): (Schedule & { latestId: string }) | null {
  if (concept.isPlaceholder || concept.muted) return null;
  const encounters = (state.encountersByConcept.get(concept.id) ?? []).map((id) => state.encounters.get(id)!);
  const latest = encounters.at(-1);
  if (!latest) return null;
  const decisive = encounters
    .flatMap((e) => e.actions)
    .filter((a) => DECISIVE.has(a.action))
    .sort((a, b) => a.at - b.at);
  const last = decisive.at(-1);
  let streak = 0;
  for (let i = decisive.length - 1; i >= 0 && decisive[i]!.action !== "marked_confused"; i--) streak++;
  const base = last ? last.at : latest.createdAt;
  return { dueAt: base + intervalDays(streak) * DAY_MS, streak, latestId: latest.id };
}

/** When one concept is due for review; null for muted concepts and ones that were never looked up. */
export function dueAtOf(state: State, conceptId: string): number | null {
  const concept = state.concepts.get(state.representative.get(conceptId) ?? conceptId);
  return (concept && scheduleOf(state, concept)?.dueAt) ?? null;
}

/** The earliest due time over all concepts, or null when there is nothing to review. */
export function nextDueAt(state: State): number | null {
  let next: number | null = null;
  for (const concept of state.concepts.values()) {
    const due = scheduleOf(state, concept)?.dueAt;
    if (due !== undefined && (next === null || due < next)) next = due;
  }
  return next;
}

export function reviewQueue(state: State, now: number, opts: { limit?: number } = {}): ReviewItem[] {
  const due: { item: ReviewItem; overdue: number }[] = [];
  for (const concept of state.concepts.values()) {
    const schedule = scheduleOf(state, concept);
    if (!schedule || now < schedule.dueAt) continue;
    const { dueAt, streak } = schedule;
    const latest = state.encounters.get(schedule.latestId)!;

    due.push({
      overdue: now - dueAt,
      item: {
        conceptId: concept.id,
        name: concept.canonicalName,
        aliases: concept.names.filter((n) => n !== concept.canonicalName),
        understanding: understandingOf(state, concept.id),
        dueAt,
        streak,
        encounterId: latest.id,
        selection: latest.selection,
        explanation: latest.explanation.text,
        sourceTitle: state.sources.get(latest.sourceId)?.title || latest.sourceId,
      },
    });
  }
  due.sort(
    (a, b) =>
      Number(b.item.understanding === "confused") - Number(a.item.understanding === "confused") ||
      b.overdue - a.overdue ||
      a.item.name.localeCompare(b.item.name),
  );
  return due.map((d) => d.item).slice(0, opts.limit ?? Infinity);
}
