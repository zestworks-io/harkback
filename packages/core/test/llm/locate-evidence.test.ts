import { describe, expect, it } from "vitest";
import { locateEvidence, verifyEvidence } from "../../src";

describe("locateEvidence", () => {
  const page = "Intro.\nWe call this LoRA:   low-rank­adaptation freezes the weights — and adds two small matrices. Then results.";
  const at = (evidence: string) => {
    const r = locateEvidence(evidence, page);
    return r && page.slice(r.start, r.end);
  };

  it("finds the quote in the page text, whatever its spacing, case, dashes and soft hyphens", () => {
    expect(at("LoRA: low-rank adaptation freezes the weights - and adds two small matrices")).toBe(
      "LoRA:   low-rank­adaptation freezes the weights — and adds two small matrices",
    );
  });

  it("finds a close quote where verifyEvidence accepts it, and nothing where it does not", () => {
    const close = "low-rank adaptation freezes the weight and adds two small matrix";
    expect(verifyEvidence(close, page)).toBe(true);
    const found = at(close)!;
    expect(found).toContain("freezes the weights");
    expect(found.length).toBeLessThan(close.length + 10);
    expect(at("an unrelated sentence about protein folding")).toBeNull();
    expect(locateEvidence(null, page)).toBeNull();
  });

  it("matches decomposed accents and ends a passage after a character outside the basic plane", () => {
    const text = "Le mode\u0301le apprend vite. Then a symbol 𝑥 ends the sentence here.";
    const r = locateEvidence("Le modèle apprend vite", text)!;
    expect(text.slice(r.start, r.end)).toBe("Le mode\u0301le apprend vite");
    const x = locateEvidence("Then a symbol x", text)!;
    expect(text.slice(x.start, x.end)).toBe("Then a symbol 𝑥");
  });
});
