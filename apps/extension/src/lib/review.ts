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
  /** The encounter a review answer is recorded on: the concept's latest one. */
  encounterId: string;
  selection: string;
  explanation: string;
  sourceTitle: string;
}

export function reviewQueue(state: State, now: number, opts: { limit?: number } = {}): ReviewItem[] {
  const due: { item: ReviewItem; overdue: number }[] = [];
  for (const concept of state.concepts.values()) {
    if (concept.isPlaceholder || concept.muted) continue;
    const encounters = (state.encountersByConcept.get(concept.id) ?? []).map((id) => state.encounters.get(id)!);
    const latest = encounters.at(-1);
    if (!latest) continue;

    const decisive = encounters.flatMap((e) => e.actions).filter((a) => DECISIVE.has(a.action)).sort((a, b) => a.at - b.at);
    const last = decisive.at(-1);
    let streak = 0;
    for (let i = decisive.length - 1; i >= 0 && decisive[i]!.action !== "marked_confused"; i--) streak++;

    const base = last ? last.at : latest.createdAt;
    const days = streak === 0 ? RETRY_DAYS : LADDER_DAYS[Math.min(streak, LADDER_DAYS.length) - 1]!;
    const dueAt = base + days * DAY_MS;
    if (now < dueAt) continue;

    due.push({
      overdue: now - dueAt,
      item: {
        conceptId: concept.id,
        name: concept.canonicalName,
        aliases: concept.names.filter((n) => n !== concept.canonicalName),
        understanding: understandingOf(state, concept.id),
        dueAt,
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
