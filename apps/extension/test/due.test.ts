import { DAY_MS } from "@harkback/core";
import { describe, expect, it } from "vitest";
import { daysText, dueText } from "../src/lib/due";

const NOW = Date.UTC(2026, 8, 10, 12);

describe("dueText", () => {
  it("says due now for a term whose time has just passed", () => {
    expect(dueText(NOW - 3_600_000, NOW, "en")).toBe("Due now");
    expect(dueText(NOW - 3_600_000, NOW, "zh")).toBe("现在该复习了");
  });

  it("counts overdue days", () => {
    expect(dueText(NOW - 2 * DAY_MS - 1000, NOW, "en")).toMatch(/^Overdue by 2 days \(/);
    expect(dueText(NOW - DAY_MS - 1000, NOW, "en")).toMatch(/^Overdue by 1 day \(/);
  });

  it("counts hours under a day and days after that", () => {
    expect(dueText(NOW + 5 * 3_600_000, NOW, "en")).toBe("Due in 5 hours");
    expect(dueText(NOW + 30 * 60_000, NOW, "en")).toBe("Due in 1 hour");
    expect(dueText(NOW + 3 * DAY_MS, NOW, "en")).toMatch(/^Due in 3 days \(/);
    expect(dueText(NOW + 3 * DAY_MS, NOW, "zh")).toMatch(/^3 天后复习（/);
  });

  it("writes the wait in days", () => {
    expect(daysText(1, "en")).toBe("1 day");
    expect(daysText(7, "en")).toBe("7 days");
    expect(daysText(7, "zh")).toBe("7 天");
  });
});
