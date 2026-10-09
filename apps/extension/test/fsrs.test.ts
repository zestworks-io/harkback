import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Grade } from "@harkback/core";
import { firstMemory, intervalFor, nextMemory, previewDays, retrievability, scheduledDays, WEIGHTS } from "../src/lib/fsrs";

const GRADES: Grade[] = [1, 2, 3, 4];

describe("retrievability and intervals", () => {
  it("is 90% after one stability, by definition", () => {
    for (const s of [0.5, 3.17, 40]) expect(retrievability(s, s)).toBeCloseTo(0.9, 10);
  });

  it("falls over time and starts at 100%", () => {
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(10, 5)).toBeLessThan(retrievability(5, 5));
  });

  it("makes the interval equal the stability at 90% and longer for a lower retention", () => {
    expect(intervalFor(8, 0.9)).toBeCloseTo(8, 10);
    expect(intervalFor(8, 0.8)).toBeGreaterThan(8);
    expect(intervalFor(8, 0.95)).toBeLessThan(8);
    expect(retrievability(intervalFor(8, 0.85), 8)).toBeCloseTo(0.85, 10);
  });
});

describe("the first answer", () => {
  it("starts from the published weights", () => {
    for (const g of GRADES) expect(firstMemory(g).stability).toBeCloseTo(WEIGHTS[g - 1]!, 10);
    expect(firstMemory(3).difficulty).toBeCloseTo(5.2824, 3);
  });

  it("gives longer waits and easier terms for better answers", () => {
    const m = GRADES.map(firstMemory);
    for (let i = 1; i < 4; i++) {
      expect(m[i]!.stability).toBeGreaterThan(m[i - 1]!.stability);
      expect(m[i]!.difficulty).toBeLessThan(m[i - 1]!.difficulty);
    }
  });

  it("schedules one day for Again and Hard, three for Good", () => {
    expect([1, 2, 3, 4].map((g) => scheduledDays(firstMemory(g as Grade), 0.9))).toEqual([1, 1, 3, 16]);
  });
});

describe("later answers", () => {
  const start = firstMemory(3);

  it("grows stability on success and by more for easier answers", () => {
    const [hard, good, easy] = [2, 3, 4].map((g) => nextMemory(start, g as Grade, 3).stability);
    expect(good!).toBeGreaterThan(start.stability);
    expect(hard!).toBeLessThan(good!);
    expect(easy!).toBeGreaterThan(good!);
  });

  it("gives roughly the second interval the algorithm is known for after a Good answer on time", () => {
    expect(scheduledDays(nextMemory(start, 3, 3), 0.9)).toBeGreaterThanOrEqual(9);
    expect(scheduledDays(nextMemory(start, 3, 3), 0.9)).toBeLessThanOrEqual(12);
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

  it("changes little when answered again the same day", () => {
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

  it("keeps stability positive and difficulty between 1 and 10, whatever the history", () => {
    fc.assert(
      fc.property(grade, run, (first, steps) => {
        let m = firstMemory(first);
        for (const [g, days] of steps) {
          m = nextMemory(m, g, days);
          expect(m.stability).toBeGreaterThan(0);
          expect(Number.isFinite(m.stability)).toBe(true);
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

  it("waits at least a day and at most about a century", () => {
    fc.assert(
      fc.property(grade, run, fc.double({ min: 0.7, max: 0.97, noNaN: true }), (first, steps, retention) => {
        let m = firstMemory(first);
        for (const [g, days] of steps) m = nextMemory(m, g, days);
        const d = scheduledDays(m, retention);
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(36500);
      }),
    );
  });
});

describe("previewDays", () => {
  it("previews a term nobody has answered yet from the first-answer memories", () => {
    expect(previewDays(null, 0, 0.9)).toEqual({ 1: 1, 2: 1, 3: 3, 4: 16 });
  });
});
