import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Grade } from "@harkback/core";
import { firstMemory, intervalFor, nextMemory, previewDays, retrievability, scheduledDays, WEIGHTS, type Memory } from "../src/lib/fsrs";

const GRADES: Grade[] = [1, 2, 3, 4];
const close = (m: Memory, expected: Memory) => {
  expect(m.stability).toBeCloseTo(expected.stability, 6);
  expect(m.stabilityFast).toBeCloseTo(expected.stabilityFast, 6);
  expect(m.difficulty).toBeCloseTo(expected.difficulty, 6);
};

describe("the reference model", () => {
  // Values produced by the reference implementation (FSRS7Algorithm in ts-fsrs 6.0.0-beta.13, a port of fsrs-rs) with the published
  // default weights: the history below, replayed through it. The port also agreed with it exactly on 6000 random steps.
  it("follows the reference through a history of answers", () => {
    let m = firstMemory(3);
    close(m, { stability: 3.9221, stabilityFast: 3.13768, difficulty: 3.53072398 });
    const history: [number, Grade, Memory][] = [
      [3, 3, { stability: 9.84870507, stabilityFast: 163.40433519, difficulty: 3.49771674 }],
      [8, 4, { stability: 20.19217069, stabilityFast: 508.85256931, difficulty: 1 }],
      [30, 1, { stability: 3.8327355, stabilityFast: 1.10296109, difficulty: 8.65596661 }],
      [1, 3, { stability: 6.69217066, stabilityFast: 36.45434776, difficulty: 8.57170695 }],
      [2.5, 2, { stability: 9.30026235, stabilityFast: 78.89178434, difficulty: 9.06657289 }],
    ];
    for (const [days, grade, expected] of history) {
      m = nextMemory(m, grade, days);
      close(m, expected);
    }
    expect(retrievability(7, m)).toBeCloseTo(0.8690686655, 8);
    expect(intervalFor(m, 0.9)).toBeCloseTo(3.4908063289, 6);
    expect(intervalFor(m, 0.8)).toBeCloseTo(24.7738525035, 6);
  });

  it("uses the 34 published weights", () => {
    expect(WEIGHTS).toHaveLength(34);
  });
});

describe("retrievability and intervals", () => {
  const m = firstMemory(3);

  it("starts at 100% and falls over time", () => {
    expect(retrievability(0, m)).toBeCloseTo(1, 4);
    expect(retrievability(10, m)).toBeLessThan(retrievability(5, m));
  });

  it("makes the interval land on the retention asked for", () => {
    for (const retention of [0.8, 0.85, 0.9]) expect(retrievability(intervalFor(m, retention), m)).toBeCloseTo(retention, 3);
  });

  it("waits longer for a lower retention", () => {
    expect(intervalFor(m, 0.8)).toBeGreaterThan(intervalFor(m, 0.9));
    expect(intervalFor(m, 0.95)).toBeLessThan(intervalFor(m, 0.9));
  });
});

describe("the first answer", () => {
  it("starts from the published weights, and the fast trace from 80% of the slow one", () => {
    for (const g of GRADES) {
      expect(firstMemory(g).stability).toBeCloseTo(WEIGHTS[g - 1]!, 6);
      expect(firstMemory(g).stabilityFast).toBeCloseTo(WEIGHTS[g - 1]! * 0.8, 6);
    }
    expect(firstMemory(3).difficulty).toBeCloseTo(3.5307, 3);
  });

  it("gives longer waits and easier terms for better answers", () => {
    const m = GRADES.map(firstMemory);
    for (let i = 1; i < 4; i++) {
      expect(m[i]!.stability).toBeGreaterThan(m[i - 1]!.stability);
      expect(m[i]!.difficulty).toBeLessThanOrEqual(m[i - 1]!.difficulty);
    }
  });

  it("schedules one day for Again and Hard, five for Good and eight weeks for Easy", () => {
    expect(GRADES.map((g) => scheduledDays(firstMemory(g), 0.9))).toEqual([1, 1, 5, 54]);
  });
});

describe("later answers", () => {
  const start = firstMemory(3);

  it("grows stability on success, by less for Hard", () => {
    const [hard, good] = [2, 3].map((g) => nextMemory(start, g as Grade, 3).stability);
    expect(good!).toBeGreaterThan(start.stability);
    expect(hard!).toBeLessThan(good!);
  });

  it("grows stability by at least as much for Easy as for Good", () => {
    for (const days of [1, 3, 10, 40])
      expect(nextMemory(start, 4, days).stability).toBeGreaterThanOrEqual(nextMemory(start, 3, days).stability);
  });

  it("spaces on-time Good answers further apart each time, up to the longest wait", () => {
    let m = firstMemory(3);
    let wait = scheduledDays(m, 0.9);
    const waits = [wait];
    for (let i = 0; i < 9; i++) {
      m = nextMemory(m, 3, wait);
      wait = scheduledDays(m, 0.9);
      waits.push(wait);
    }
    expect(waits.slice(0, 4)).toEqual([5, 27, 94, 298]);
    for (let i = 1; i < waits.length; i++) expect(waits[i]!).toBeGreaterThanOrEqual(waits[i - 1]!);
    expect(waits.at(-1)).toBe(365);
  });

  it("never lets a lapse raise stability, and raises difficulty", () => {
    const grown = nextMemory(start, 3, 3);
    const lapsed = nextMemory(grown, 1, 10);
    expect(lapsed.stability).toBeLessThan(grown.stability);
    expect(lapsed.difficulty).toBeGreaterThan(grown.difficulty);
  });

  it("gives more credit for an answer that comes late", () => {
    expect(nextMemory(start, 3, 30).stability).toBeGreaterThan(nextMemory(start, 3, 3).stability);
  });

  it("copes with a fraction of a day, as when answered again the same day", () => {
    expect(nextMemory(start, 3, 0.1).stability).toBeGreaterThanOrEqual(start.stability);
    expect(nextMemory(start, 1, 0.1).stability).toBeLessThan(start.stability);
  });

  it("asks for more reviews at a higher retention", () => {
    const m = nextMemory(start, 3, 3);
    expect(scheduledDays(m, 0.95)).toBeLessThan(scheduledDays(m, 0.8));
  });
});

describe("properties", () => {
  const grade = fc.constantFrom<Grade>(1, 2, 3, 4);
  const run = fc.array(fc.tuple(grade, fc.double({ min: 0, max: 400, noNaN: true })), { minLength: 1, maxLength: 30 });

  it("keeps both stabilities positive and difficulty between 1 and 10, whatever the history", () => {
    fc.assert(
      fc.property(grade, run, (first, steps) => {
        let m = firstMemory(first);
        for (const [g, days] of steps) {
          m = nextMemory(m, g, days);
          for (const s of [m.stability, m.stabilityFast]) {
            expect(s).toBeGreaterThan(0);
            expect(Number.isFinite(s)).toBe(true);
          }
          expect(m.difficulty).toBeGreaterThanOrEqual(1);
          expect(m.difficulty).toBeLessThanOrEqual(10);
        }
      }),
    );
  });

  it("never makes a better answer wait less than a worse one", () => {
    fc.assert(
      fc.property(grade, fc.double({ min: 1, max: 400, noNaN: true }), (first, days) => {
        const p = previewDays(firstMemory(first), days, 0.9);
        expect(p[1]).toBeLessThanOrEqual(p[2]);
        expect(p[2]).toBeLessThanOrEqual(p[3]);
        expect(p[3]).toBeLessThanOrEqual(p[4]);
      }),
    );
  });

  it("waits at least a day and at most a year", () => {
    fc.assert(
      fc.property(grade, run, fc.double({ min: 0.7, max: 0.97, noNaN: true }), (first, steps, retention) => {
        let m = firstMemory(first);
        for (const [g, days] of steps) m = nextMemory(m, g, days);
        const d = scheduledDays(m, retention);
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(365);
      }),
    );
  });
});

describe("previewDays", () => {
  it("previews a term nobody has answered yet from the first-answer memories", () => {
    expect(previewDays(null, 0, 0.9)).toEqual({ 1: 1, 2: 1, 3: 5, 4: 54 });
  });
});
