import type { Grade } from "@harkback/core";

/**
 * The FSRS-5 memory model (https://github.com/open-spaced-repetition/fsrs4anki): every term has a stability (the days it takes
 * for the chance of remembering it to fall to 90%) and a difficulty. Each answer updates both; the next review is due when the
 * chance of remembering falls to the retention you asked for. The weights are the published defaults.
 */
export const WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const MIN_STABILITY = 0.01;
const MAX_INTERVAL_DAYS = 36500;

export interface Memory {
  /** Days for the chance of remembering to fall to 90%. */
  stability: number;
  /** 1 (easy) to 10 (hard). */
  difficulty: number;
}

const w = (i: number): number => WEIGHTS[i]!;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const clampDifficulty = (d: number): number => clamp(d, 1, 10);

/** The chance of remembering after `elapsedDays` without a review. */
export function retrievability(elapsedDays: number, stability: number): number {
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY;
}

/** Days until the chance of remembering falls to `retention`. At 90% this is the stability itself. */
export function intervalFor(stability: number, retention: number): number {
  return (stability / FACTOR) * (retention ** (1 / DECAY) - 1);
}

const initialDifficulty = (g: number): number => w(4) - Math.exp(w(5) * (g - 1)) + 1;

/** The memory after the first answer. */
export function firstMemory(grade: Grade): Memory {
  return { stability: Math.max(MIN_STABILITY, w(grade - 1)), difficulty: clampDifficulty(initialDifficulty(grade)) };
}

function nextDifficulty(d: number, grade: Grade): number {
  const damped = d + (-w(6) * (grade - 3) * (10 - d)) / 9;
  // Pulled a little toward the difficulty of an easy first answer, so it cannot drift to an extreme.
  return clampDifficulty(w(7) * initialDifficulty(4) + (1 - w(7)) * damped);
}

/** The memory after answering `grade` once `elapsedDays` have passed since the last answer. */
export function nextMemory(m: Memory, grade: Grade, elapsedDays: number): Memory {
  const r = retrievability(elapsedDays, m.stability);
  const difficulty = nextDifficulty(m.difficulty, grade);
  let stability: number;
  if (elapsedDays < 1) {
    // Answered again the same day: only a small change.
    stability = m.stability * Math.exp(w(17) * (grade - 3 + w(18)));
    if (grade >= 3) stability = Math.max(stability, m.stability);
  } else if (grade === 1) {
    const lapsed = w(11) * m.difficulty ** -w(12) * ((m.stability + 1) ** w(13) - 1) * Math.exp(w(14) * (1 - r));
    stability = Math.min(lapsed, m.stability);
  } else {
    const hardPenalty = grade === 2 ? w(15) : 1;
    const easyBonus = grade === 4 ? w(16) : 1;
    stability =
      m.stability *
      (1 + Math.exp(w(8)) * (11 - m.difficulty) * m.stability ** -w(9) * (Math.exp(w(10) * (1 - r)) - 1) * hardPenalty * easyBonus);
  }
  return { stability: Math.max(MIN_STABILITY, stability), difficulty };
}

/** Whole days to wait, at least one: a review is never due the same day it was answered. */
export function scheduledDays(m: Memory, retention: number): number {
  return clamp(Math.round(intervalFor(m.stability, retention)), 1, MAX_INTERVAL_DAYS);
}

/** What each answer would schedule next, for the buttons: the wait in whole days after answering `elapsedDays` from the last review. */
export function previewDays(m: Memory | null, elapsedDays: number, retention: number): Record<Grade, number> {
  const after = (g: Grade): number => scheduledDays(m ? nextMemory(m, g, elapsedDays) : firstMemory(g), retention);
  return { 1: after(1), 2: after(2), 3: after(3), 4: after(4) };
}
