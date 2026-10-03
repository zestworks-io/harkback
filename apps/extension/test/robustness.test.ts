import { describe, expect, it } from "vitest";
import { withDefaults } from "../src/lib/settings";
import { sensitiveBySiteRule } from "../src/lib/site-rules";
import { StateCache } from "../src/lib/state-cache";

describe("sensitiveBySiteRule", () => {
  const rules = [
    { pattern: "secret.example.com", sensitive: true },
    { pattern: "https://secret.example.com/public", sensitive: false },
  ];

  it("calls a recorded source sensitive when a rule says so for its address", () => {
    expect(sensitiveBySiteRule(rules, { ids: { url: "https://secret.example.com/doc" } })).toBe(true);
    expect(sensitiveBySiteRule(rules, { ids: { url: "https://secret.example.com/public/page" } })).toBe(false);
    expect(sensitiveBySiteRule(rules, { ids: { url: "https://other.example.com/doc" } })).toBe(false);
  });

  it("has no opinion about a source with no address", () => {
    expect(sensitiveBySiteRule(rules, { ids: {} })).toBe(false);
  });
});

describe("StateCache", () => {
  it("does not remember a failed read", async () => {
    let calls = 0;
    const cache = new StateCache({
      all: async () => {
        if (++calls === 1) throw new Error("disk");
        return [];
      },
    });
    await expect(cache.get()).rejects.toThrow("disk");
    expect((await cache.get()).concepts.size).toBe(0);
    expect(calls).toBe(2);
  });
});

describe("withDefaults", () => {
  it("replaces limits that would lock requests out or never fire", () => {
    const s = withDefaults({ rateLimit: { perMinute: 0, perHour: 2.5 }, reunion: { minGapDays: -1, maxPerPage: 0 } });
    expect(s.rateLimit).toEqual({ perMinute: 10, perHour: 100 });
    expect(s.reunion.maxPerPage).toBeGreaterThanOrEqual(1);
    expect(s.reunion.minGapDays).toBeGreaterThanOrEqual(0);
  });

  it("keeps good limits", () => {
    const s = withDefaults({ rateLimit: { perMinute: 3, perHour: 30 }, reunion: { minGapDays: 0, maxPerPage: 4 } });
    expect(s.rateLimit).toEqual({ perMinute: 3, perHour: 30 });
    expect(s.reunion).toEqual({ minGapDays: 0, maxPerPage: 4 });
  });
});
