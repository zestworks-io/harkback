import type { Action } from "@harkback/spec";

/** How well a term was remembered when it was answered: 1 forgot, 2 recalled with effort, 3 recalled, 4 recalled easily. */
export type Grade = 1 | 2 | 3 | 4;

const GRADES: Partial<Record<Action, Grade>> = {
  review_again: 1,
  review_hard: 2,
  review_good: 3,
  review_easy: 4,
  // Marks made before review had four grades, and the ones made on the explain card and reunion hints.
  marked_confused: 1,
  marked_understood: 3,
  reunion_recalled: 3,
};

/** The grade an action gives, or null for actions that say nothing about remembering (a follow-up, a comparison). */
export function gradeOf(action: Action): Grade | null {
  return GRADES[action] ?? null;
}

/** The action a review answer is recorded as. */
export const REVIEW_ACTIONS = ["review_again", "review_hard", "review_good", "review_easy"] as const satisfies readonly Action[];
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
