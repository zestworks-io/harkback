import type { Grade } from "@harkback/core";

/**
 * The FSRS-7 memory model (https://github.com/open-spaced-repetition), ported from the reference implementation in
 * fsrs-rs and ts-fsrs (MIT): every term has two stabilities, a fast one and a slow one, and a difficulty. The chance of
 * remembering is a mixture of two forgetting curves, one per stability. Each answer updates all three; the next review is due when
 * the chance of remembering falls to the retention you asked for. The weights are the published defaults.
 */
export const WEIGHTS: readonly number[] = [
  0.1104, 2.2395, 3.9221, 11.7841, 6.1686, 0.6457, 3.6807, 1.9795, 0, 1.3826, 0.7024, 0.5999, 0.8146, 0.6398, 1, 1.3207, 0.6707, 3.8668,
  0.4416, 0.0934, 1.8631, 0.6162, 1.0869, 0.1567, 0.0801, 0.2421, 0.9464, 0.1433, 0.7145, 0, 0.5667, 0.3734, 0.5333, 0.3048,
];

const MIN_STABILITY = 1e-4;
const MAX_STABILITY = 36500;
/**
 * The longest wait. With the default weights an on-time run of Good answers grows the wait about threefold each time and would hide a
 * term for years; a term not seen for a year is worth checking anyway.
 */
const MAX_INTERVAL_DAYS = 365;
/** The fast trace starts at this share of the slow one, and a lapse cannot leave it above this share of the new slow stability. */
const FAST_SHARE = 0.8;
/** The shortest wait the interval solver considers: one second. */
const MIN_T = 1 / 86400;
const LOG_MIN_T = Math.log(MIN_T);
const RETENTION_MIN = 1e-4;
const RETENTION_MAX = 0.9999;

export interface Memory {
  /** Days for the slow trace's chance of remembering to fall to 90%. */
  stability: number;
  /** The same for the fast trace, which forgets sooner and matters for recent answers. */
  stabilityFast: number;
  /** 1 (easy) to 10 (hard). */
  difficulty: number;
}

const w = (i: number): number => WEIGHTS[i]!;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const clampDifficulty = (d: number): number => clamp(d, 1, 10);
const clampStability = (s: number): number => clamp(s, MIN_STABILITY, MAX_STABILITY);
const round8 = (x: number): number => Math.round(x * 1e8) / 1e8;

/** The fast trace's curve for a given fast stability. */
function fastCurve(s: number): { decay: number; scale: number } {
  const decay = -clamp(w(23) * s ** (w(33) - 0.3), 0.01, 0.95);
  return { decay, scale: (Math.exp(Math.min(Math.log(w(25)) / decay, 60)) - 1) / s };
}

/** The mixture of both curves for one memory, prepared once so that solving for an interval does not redo it. */
function prepare(m: Memory) {
  const s = clampStability(m.stability);
  const sFast = clampStability(m.stabilityFast);
  const d = clampDifficulty(m.difficulty);
  const fast = fastCurve(sFast);
  const decay = -clamp(w(24), 0.01, 0.95);
  const scale = ((w(26) ** (1 / decay) - 1) * Math.exp((d - 5) * (w(32) - 0.3))) / s;
  const weightFast = w(27) * sFast ** -w(29);
  const weightSlow = w(28) * s ** w(30) * Math.exp((d - 5) * (w(31) - 0.5));
  return { fast, decay, scale, weightFast, weightSlow, total: weightFast + weightSlow };
}

type Prepared = ReturnType<typeof prepare>;

/** The chance of remembering after `t` days, and how fast it is falling. */
function curve(t: number, p: Prepared): { retrievability: number; derivative: number } {
  const days = Math.max(t, 0);
  const fastBase = 1 + p.fast.scale * days;
  const slowBase = 1 + p.scale * days;
  const fastRecall = fastBase ** p.fast.decay;
  const slowRecall = slowBase ** p.decay;
  const fastDerivative = p.fast.decay * fastBase ** (p.fast.decay - 1) * p.fast.scale;
  const slowDerivative = p.decay * slowBase ** (p.decay - 1) * p.scale;
  return {
    retrievability: ((p.weightFast * fastRecall + p.weightSlow * slowRecall) / p.total) * 0.99998 + 1e-5,
    derivative: ((p.weightFast * fastDerivative + p.weightSlow * slowDerivative) / p.total) * 0.99998,
  };
}

/** The chance of remembering after `elapsedDays` without a review. */
export function retrievability(elapsedDays: number, m: Memory): number {
  return curve(elapsedDays, prepare(m)).retrievability;
}

/** Days until the chance of remembering falls to `retention`, found by Newton's method with a bisection fallback. */
export function intervalFor(m: Memory, retention: number): number {
  const target = clamp(retention, RETENTION_MIN, RETENTION_MAX);
  if (target >= RETENTION_MAX) return 0;
  const maxStability = Math.max(clampStability(m.stability), clampStability(m.stabilityFast));
  const p = prepare(m);
  let logT = Math.log(maxStability);
  for (let i = 0; i < 7; i++) {
    logT = clamp(logT, LOG_MIN_T, Math.log(MAX_STABILITY));
    const t = clamp(Math.exp(logT), MIN_T, MAX_STABILITY);
    const { retrievability: r, derivative } = curve(t, p);
    logT -= clamp((r - target) / Math.min(derivative * t, -1e-12), -4, 4);
    if (!Number.isFinite(logT)) break;
  }
  const interval = clamp(Math.exp(logT), 0, MAX_STABILITY);
  if (Math.abs(curve(interval, p).retrievability - target) <= 0.001) return interval;
  let low = 0;
  let high = Math.min(Math.max(maxStability, 1), MAX_STABILITY);
  while (curve(high, p).retrievability > target && high < MAX_STABILITY) high = Math.min(high * 2, MAX_STABILITY);
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (curve(mid, p).retrievability > target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

const initialDifficulty = (g: number): number => w(4) - Math.exp(w(5) * (g - 1)) + 1;

/** The memory after the first answer. */
export function firstMemory(grade: Grade): Memory {
  const stability = clampStability(w(grade - 1));
  return {
    stability: round8(stability),
    stabilityFast: round8(clampStability(stability * FAST_SHARE)),
    difficulty: round8(clampDifficulty(initialDifficulty(grade))),
  };
}

/** One trace's new stability; the slow trace uses weights 7 to 14 and the fast trace 15 to 22. */
function nextStability(s: number, d: number, r: number, grade: Grade, start: number): number {
  const lapsed = Math.min(s, w(start + 3) * ((s + 1) ** w(start + 4) - 1) * Math.exp((1 - r) * w(start + 5)));
  if (grade === 1) return lapsed;
  const hardPenalty = grade === 2 ? w(start + 6) : 1;
  const easyBonus = grade === 4 ? w(start + 7) : 1;
  const increase =
    Math.exp(w(start) - 1.5) * (11 - d) * s ** -w(start + 1) * (Math.exp((1 - r) * w(start + 2)) - 1) * hardPenalty * easyBonus + 1;
  return Math.max(lapsed, s * increase);
}

/** The memory after answering `grade` once `elapsedDays` (which may be a fraction) have passed since the last answer. */
export function nextMemory(m: Memory, grade: Grade, elapsedDays: number): Memory {
  const s = clampStability(m.stability);
  const sFast = clampStability(m.stabilityFast);
  const d = clampDifficulty(m.difficulty);
  const p = prepare(m);
  const r = curve(elapsedDays, p).retrievability;
  const stability = nextStability(s, d, r, grade, 7);
  const fastRecall = (1 + p.fast.scale * Math.max(elapsedDays, 0)) ** p.fast.decay;
  let stabilityFast = nextStability(sFast, d, fastRecall, grade, 15);
  if (grade === 1) stabilityFast = Math.min(stabilityFast, stability * FAST_SHARE);
  let delta = -w(6) * (grade - 3);
  // A lapse on a term that was still well remembered counts for more.
  if (grade === 1) delta *= r + 0.1;
  // Pulled 1% toward the difficulty of an easy first answer, so it cannot drift to an extreme.
  const difficulty = 0.01 * initialDifficulty(4) + 0.99 * (d + ((10 - d) * delta) / 9);
  return {
    stability: round8(clampStability(stability)),
    stabilityFast: round8(clampStability(stabilityFast)),
    difficulty: round8(clampDifficulty(difficulty)),
  };
}

/** Whole days to wait, at least one: a review is never due the same day it was answered. */
export function scheduledDays(m: Memory, retention: number): number {
  return clamp(Math.round(intervalFor(m, retention)), 1, MAX_INTERVAL_DAYS);
}

/** What each answer would schedule next, for the buttons: the wait in whole days after answering `elapsedDays` from the last review. */
export function previewDays(m: Memory | null, elapsedDays: number, retention: number): Record<Grade, number> {
  const after = (g: Grade): number => scheduledDays(m ? nextMemory(m, g, elapsedDays) : firstMemory(g), retention);
  return { 1: after(1), 2: after(2), 3: after(3), 4: after(4) };
}
