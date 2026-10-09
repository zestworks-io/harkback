import { DAY_MS, gradeOf, type Grade, type State } from "@harkback/core";
import type { Action } from "@harkback/spec";
import { understandingOf, type Understanding } from "../records/concept-detail";
import { orderByPrerequisites, prerequisiteMap } from "./prerequisites";
import { firstMemory, nextMemory, previewDays, scheduledDays, type Memory } from "./fsrs";

/** The chance of remembering a term when it comes due, unless the settings say otherwise. */
export const DEFAULT_RETENTION = 0.9;
/** A term that was looked up but never answered comes up again after this many days. */
const UNANSWERED_DAYS = 1;
/** The marks on the explain card, which older versions also used as review answers (a day or more after the look-up). */
const CARD_MARKS: ReadonlySet<Action> = new Set(["marked_understood", "marked_confused"]);

export interface ReviewItem {
  conceptId: string;
  name: string;
  aliases: string[];
  understanding: Understanding;
  dueAt: number;
  /** How many times it has been answered; 0 for a term that was only looked up. */
  answers: number;
  /** The wait in days each answer would give, for the buttons. */
  previews: Record<Grade, number>;
  /** Due terms that build on this one, which therefore come after it; empty when none do. */
  unlocks: string[];
  /** The encounter a review answer is recorded on: the concept's latest one. */
  encounterId: string;
  selection: string;
  explanation: string;
  sourceTitle: string;
}

interface Schedule {
  dueAt: number;
  memory: Memory | null;
  answers: number;
  /** When the last answer was given; the look-up time for a term never answered. */
  lastAt: number;
}

/** When a concept is next due, replayed from its answers: each one updates what the model knows about how well it is remembered. */
function scheduleOf(
  state: State,
  concept: { id: string; isPlaceholder: boolean; muted: boolean },
  retention: number,
): (Schedule & { latestId: string }) | null {
  if (concept.isPlaceholder || concept.muted) return null;
  const encounters = (state.encountersByConcept.get(concept.id) ?? []).map((id) => state.encounters.get(id)!);
  const latest = encounters.at(-1);
  if (!latest) return null;
  const answers = encounters
    .flatMap((e) => e.actions.map((a) => ({ ...a, lookedUpAt: e.createdAt })))
    .flatMap((a) => {
      const grade = gradeOf(a.action);
      if (grade === null) return [];
      // A mark made on the explain card right after a look-up says how the explanation read, not how well it is remembered.
      if (CARD_MARKS.has(a.action) && a.at - a.lookedUpAt < DAY_MS) return [];
      return [{ grade, at: a.at }];
    })
    .sort((a, b) => a.at - b.at);
  let memory: Memory | null = null;
  let lastAt = 0;
  for (const { grade, at } of answers) {
    memory = memory ? nextMemory(memory, grade, Math.max(0, at - lastAt) / DAY_MS) : firstMemory(grade);
    lastAt = at;
  }
  if (!memory)
    return { dueAt: latest.createdAt + UNANSWERED_DAYS * DAY_MS, memory, answers: 0, lastAt: latest.createdAt, latestId: latest.id };
  return { dueAt: lastAt + scheduledDays(memory, retention) * DAY_MS, memory, answers: answers.length, lastAt, latestId: latest.id };
}

/** When one concept is due for review; null for muted concepts and ones that were never looked up. */
export function dueAtOf(state: State, conceptId: string, retention = DEFAULT_RETENTION): number | null {
  const concept = state.concepts.get(state.representative.get(conceptId) ?? conceptId);
  return (concept && scheduleOf(state, concept, retention)?.dueAt) ?? null;
}

/** The earliest due time over all concepts, or null when there is nothing to review. */
export function nextDueAt(state: State, retention = DEFAULT_RETENTION): number | null {
  let next: number | null = null;
  for (const concept of state.concepts.values()) {
    const due = scheduleOf(state, concept, retention)?.dueAt;
    if (due !== undefined && (next === null || due < next)) next = due;
  }
  return next;
}

/** Terms you struggle with come first. */
const WEAKNESS: Record<Understanding, number> = { confused: 2, shaky: 1, understood: 0, new: 0 };

export function reviewQueue(state: State, now: number, opts: { limit?: number; retention?: number } = {}): ReviewItem[] {
  const retention = opts.retention ?? DEFAULT_RETENTION;
  const due: { item: ReviewItem; overdue: number }[] = [];
  for (const concept of state.concepts.values()) {
    const schedule = scheduleOf(state, concept, retention);
    if (!schedule || now < schedule.dueAt) continue;
    const { dueAt, answers, memory, lastAt } = schedule;
    const latest = state.encounters.get(schedule.latestId)!;

    due.push({
      overdue: now - dueAt,
      item: {
        conceptId: concept.id,
        name: concept.canonicalName,
        aliases: concept.names.filter((n) => n !== concept.canonicalName),
        understanding: understandingOf(state, concept.id),
        dueAt,
        answers,
        unlocks: [],
        previews: previewDays(memory, Math.max(0, now - lastAt) / DAY_MS, retention),
        encounterId: latest.id,
        selection: latest.selection,
        explanation: latest.explanation.text,
        sourceTitle: state.sources.get(latest.sourceId)?.title || latest.sourceId,
      },
    });
  }
  due.sort(
    (a, b) =>
      WEAKNESS[b.item.understanding] - WEAKNESS[a.item.understanding] || b.overdue - a.overdue || a.item.name.localeCompare(b.item.name),
  );
  // A term comes after the terms it builds on, when those are due too.
  const { ordered, dependents } = orderByPrerequisites(due, (d) => d.item.conceptId, prerequisiteMap(state));
  const nameOf = new Map(ordered.map((d) => [d.item.conceptId, d.item.name]));
  for (const { item } of ordered) item.unlocks = (dependents.get(item.conceptId) ?? []).map((id) => nameOf.get(id)!);
  return ordered.map((d) => d.item).slice(0, opts.limit ?? Infinity);
}
