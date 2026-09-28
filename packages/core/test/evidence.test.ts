import { describe, expect, it } from "vitest";
import { approxSubstringSimilarity, verifyEvidence } from "../src";

const page =
  "In this section we describe the method. We freeze the pre-trained model weights and inject trainable rank decomposition matrices into each layer of the Transformer architecture, greatly reducing the number of trainable parameters.";

describe("approxSubstringSimilarity", () => {
  it("is 1 for an exact substring and lower for edits", () => {
    expect(approxSubstringSimilarity("rank decomposition", page)).toBe(1);
    expect(approxSubstringSimilarity("rank decompositon", page)).toBeGreaterThan(0.9);
  });
});

describe("verifyEvidence", () => {
  it("accepts an exact quote", () => {
    expect(verifyEvidence("We freeze the pre-trained model weights", page)).toBe(true);
  });

  it("accepts a quote with small differences, case, whitespace and soft hyphens", () => {
    expect(verifyEvidence("we freeze the pretrained model weights and inject trainable rank decomposition matrices", page)).toBe(true);
    expect(verifyEvidence("WE  FREEZE the pre-trained model weights", page)).toBe(true);
    expect(verifyEvidence("inject trainable rank decom\u00ADposition matrices", page)).toBe(true);
  });

  it("rejects a fabricated quote", () => {
    expect(verifyEvidence("LoRA was introduced by Microsoft Research in 2021 as an adapter", page)).toBe(false);
  });

  it("rejects null and very short evidence", () => {
    expect(verifyEvidence(null, page)).toBe(false);
    expect(verifyEvidence("the", page)).toBe(false);
  });

  it("checks a 200-character quote against a ~200KB page within 500ms", () => {
    const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(1800);
    const quote = page.slice(0, 200);
    const big = `${filler}${page}${filler}`;
    const started = performance.now();
    expect(verifyEvidence(`${quote.slice(0, 100)}X${quote.slice(101)}`, big)).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
