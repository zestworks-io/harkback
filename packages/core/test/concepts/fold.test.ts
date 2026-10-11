import { describe, expect, it } from "vitest";
import { foldArabic, foldHan, HAN_PAIRS, isArabicMark } from "../../src/concepts/fold";

describe("foldArabic", () => {
  it("drops vowel marks and tatweel", () => {
    expect(foldArabic("الشَّبَكَةُ")).toBe("الشبكه");
    expect(foldArabic("كـتـاب")).toBe("كتاب");
  });

  it("unifies alef, ya and ta marbuta forms", () => {
    expect(foldArabic("أحمد إبراهيم آمن ٱلله")).toBe("احمد ابراهيم امن الله");
    expect(foldArabic("مستشفى")).toBe("مستشفي");
    expect(foldArabic("مدرسة")).toBe("مدرسه");
  });

  it("unifies Persian and Urdu letters with their Arabic counterparts", () => {
    expect(foldArabic("کتاب")).toBe("كتاب");
    expect(foldArabic("یک")).toBe("يك");
  });

  it("writes Arabic-Indic and Persian digits as ASCII digits", () => {
    expect(foldArabic("نموذج ٣٢ و ۴۵")).toBe("نموذج 32 و 45");
  });

  it("leaves other scripts alone", () => {
    expect(foldArabic("LoRA 低秩")).toBe("LoRA 低秩");
  });

  it("recognises the marks it drops", () => {
    expect(isArabicMark("َ")).toBe(true);
    expect(isArabicMark("ـ")).toBe(true);
    expect(isArabicMark("ب")).toBe(false);
  });
});

describe("foldHan", () => {
  it("writes the common technical Traditional characters in Simplified form", () => {
    expect(foldHan("神經網絡")).toBe("神经网络");
    expect(foldHan("機器學習")).toBe("机器学习");
    expect(foldHan("後驗機率")).toBe("后验机率");
  });

  it("leaves Simplified and non-Han text alone", () => {
    expect(foldHan("神经网络 LoRA")).toBe("神经网络 LoRA");
  });

  it("has a clean table: pairs of two different characters, no Traditional character twice", () => {
    const seen = new Set<string>();
    for (const pair of HAN_PAIRS) {
      const [trad, simp, ...rest] = Array.from(pair);
      expect(rest).toEqual([]);
      expect(trad).toBeDefined();
      expect(simp).toBeDefined();
      expect(trad).not.toBe(simp);
      expect(seen.has(trad!)).toBe(false);
      seen.add(trad!);
    }
  });

  it("never maps a character to another character of the table, so one pass is enough", () => {
    const trads = new Set(HAN_PAIRS.map((p) => Array.from(p)[0]));
    for (const pair of HAN_PAIRS) expect(trads.has(Array.from(pair)[1])).toBe(false);
  });
});
