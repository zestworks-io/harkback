import { describe, expect, it } from "vitest";
import { detectScript, identityKey, normalizeName } from "../src";

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
    expect(identityKey(" ,.;") ).toBe("");
  });
});
