import { describe, expect, it } from "vitest";
import { coalesce } from "../../src/lib/pages/coalesce";

describe("coalesce", () => {
  it("runs once more after a run for all the asks made during it, and spaces runs apart", async () => {
    let clock = 0;
    const waited: number[] = [];
    let runs = 0;
    let release!: () => void;
    const task = () =>
      new Promise<void>((r) => {
        runs++;
        release = r;
      });
    const run = coalesce(
      task,
      1000,
      async (ms) => void (waited.push(ms), (clock += ms)),
      () => clock,
    );

    const first = run();
    expect(runs).toBe(1);
    clock = 200;
    const a = run();
    const b = run();
    expect(a).toBe(b);
    release();
    await first;
    await new Promise((r) => setTimeout(r, 0));
    // The asks made during the first run share one more, which waits out the rest of the gap.
    expect(runs).toBe(2);
    expect(waited).toEqual([800]);
    release();
    await a;

    // Long after, an ask runs at once.
    clock = 10_000;
    void run();
    expect(runs).toBe(3);
    release();
  });

  it("runs again after a run that failed", async () => {
    let runs = 0;
    const run = coalesce(async () => {
      runs++;
      if (runs === 1) throw new Error("no");
    }, 0);
    const first = run();
    const second = run();
    await expect(first).rejects.toThrow("no");
    await second;
    expect(runs).toBe(2);
  });
});
