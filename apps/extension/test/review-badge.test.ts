import { describe, expect, it } from "vitest";
import { badgeFor } from "../src/lib/review-badge";

describe("badgeFor", () => {
  it("shows nothing when nothing is due", () => {
    expect(badgeFor(0, "en")).toEqual({ text: "", title: "Harkback: scan this page" });
    expect(badgeFor(0, "zh").text).toBe("");
  });

  it("shows the count and says what it is in the tooltip", () => {
    expect(badgeFor(3, "en")).toEqual({ text: "3", title: "Harkback: scan this page\n3 to review" });
    expect(badgeFor(3, "zh")).toEqual({ text: "3", title: "Harkback: 扫描此页\n3 个待复习" });
  });

  it("caps a long queue", () => {
    expect(badgeFor(250, "en").text).toBe("99+");
    expect(badgeFor(99, "en").text).toBe("99");
  });

  it("treats a negative or fractional count as nothing due", () => {
    expect(badgeFor(-2, "en").text).toBe("");
    expect(badgeFor(Number.NaN, "en").text).toBe("");
  });
});
