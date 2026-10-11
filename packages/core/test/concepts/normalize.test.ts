import { describe, expect, it } from "vitest";
import { detectScript, identityKey, normalizeName } from "../../src";

describe("normalizeName", () => {
  it("folds case, separators and plurals for long Latin names", () => {
    expect(normalizeName("Low-Rank Adaptation")).toEqual({ norm: "lowrankadaptation", script: "latin", caseKey: null });
    expect(identityKey("low rank adaptations")).toBe(identityKey("Low-Rank Adaptation"));
    expect(identityKey("strategies")).toBe("strategy");
    expect(identityKey("classes")).toBe("class");
    expect(identityKey("analysis")).toBe("analysis");
  });

  it("keeps case for names of four characters or fewer", () => {
    expect(identityKey("LoRA")).toBe("LoRA");
    expect(identityKey("LoRa")).toBe("LoRa");
    expect(identityKey("LoRA")).not.toBe(identityKey("LoRa"));
    expect(identityKey("LLMs")).toBe("LLM");
    expect(identityKey("LoRAs")).toBe("LoRA");
    expect(identityKey("Mass")).toBe("Mass");
  });

  it("applies NFKC, trims edge punctuation and keeps meaningful symbols", () => {
    expect(identityKey("ＬｏＲＡ")).toBe("LoRA");
    expect(identityKey("“LoRA”，")).toBe("LoRA");
    expect(identityKey("C#")).toBe("C#");
    expect(identityKey("LoRA+")).toBe("lora+");
  });

  it("transliterates Greek letters", () => {
    expect(identityKey("α-divergence")).toBe("alphadivergence");
  });

  it("handles CJK names without case or plural rules", () => {
    expect(detectScript("低秩适配")).toBe("cjk");
    expect(normalizeName("低秩 适配")).toEqual({ norm: "低秩适配", script: "cjk", caseKey: null });
    expect(detectScript("LoRA微调")).toBe("cjk");
  });

  it("returns an empty key for punctuation-only input", () => {
    expect(identityKey(" ,.;")).toBe("");
  });
});

describe("Arabic names", () => {
  it("are their own script, also when mixed with Latin letters", () => {
    expect(detectScript("الشبكة العصبية")).toBe("arabic");
    expect(detectScript("LoRA الشبكة")).toBe("arabic");
    expect(detectScript("LoRA")).toBe("latin");
    expect(detectScript("低秩适配")).toBe("cjk");
  });

  it("are one term whatever the vowel marks, alef, ya and ta marbuta forms", () => {
    const plain = identityKey("الشبكة العصبية");
    expect(plain).not.toBe("");
    expect(identityKey("الشَّبَكَةُ العصبيّة")).toBe(plain);
    expect(identityKey("الشبكه العصبيه")).toBe(plain);
    expect(identityKey("«الشبكة العصبية»،")).toBe(plain);
    expect(identityKey("ألخوارزمية")).toBe(identityKey("الخوارزمية"));
  });

  it("have no case key and keep their word endings", () => {
    expect(normalizeName("الشبكات")).toEqual({ norm: "الشبكات", script: "arabic", caseKey: null });
    expect(normalizeName("الشبكة العصبية").norm).toBe("الشبكهالعصبيه");
  });
});

describe("Han names", () => {
  it("treat Traditional and Simplified spellings of the technical characters as one term", () => {
    expect(identityKey("神經網絡")).toBe(identityKey("神经网络"));
    expect(identityKey("機器學習")).toBe(identityKey("机器学习"));
    expect(normalizeName("神經網絡").script).toBe("cjk");
  });

  it("keep hiragana and katakana apart, and fold half-width katakana", () => {
    expect(identityKey("ひと")).not.toBe(identityKey("ヒト"));
    expect(identityKey("ﾓﾃﾞﾙ")).toBe(identityKey("モデル"));
  });
});
