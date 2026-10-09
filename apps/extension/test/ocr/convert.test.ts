import { describe, expect, it } from "vitest";
import { fromOcr, isImagePage, joinCjk, type OcrLine, type ToPdf } from "../../src/lib/ocr/convert";
import { groupParagraphs } from "../../src/lib/pdf/layout";

const DPI = 300 / 72;
const PAGE_HEIGHT = 792;
/** The viewport's mapping for an upright page drawn at 300 dpi: pixels to PDF units, y flipped. */
const toPdf: ToPdf = (px, py) => [px / DPI, PAGE_HEIGHT - py / DPI];

const line = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 95, rowHeight?: number): OcrLine => ({
  text,
  bbox: { x0, y0, x1, y1 },
  confidence,
  ...(rowHeight ? { baseline: { y0: y1 - 8, y1: y1 - 8 }, rowHeight } : {}),
});

describe("joinCjk", () => {
  it("removes the spaces Tesseract puts between Chinese and Japanese characters", () => {
    expect(joinCjk("深 度 学 习 是 一 种 方 法")).toBe("深度学习是一种方法");
    expect(joinCjk("こ ん に ち は")).toBe("こんにちは");
  });

  it("keeps the spaces between words, and between a word and a character", () => {
    expect(joinCjk("Deep  learning   rocks")).toBe("Deep learning rocks");
    expect(joinCjk("使用 LoRA 微 调")).toBe("使用 LoRA 微调");
  });
});

describe("fromOcr", () => {
  it("places a line with its left edge and baseline in PDF units, y upwards", () => {
    const { items } = fromOcr([line("Hello world", 300, 486, 1500, 525, 95, 39)], toPdf);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.str).toBe("Hello world");
    expect(item.x).toBeCloseTo(300 / DPI);
    expect(item.w).toBeCloseTo(1200 / DPI);
    expect(item.y).toBeCloseTo(PAGE_HEIGHT - 517 / DPI);
    expect(item.h).toBeCloseTo((0.9 * 39) / DPI);
    expect(fromOcr([line("Lower", 300, 900, 1500, 939, 95, 39)], toPdf).items[0]!.y).toBeLessThan(item.y);
  });

  it("estimates the baseline from the box when none was measured", () => {
    const item = fromOcr([line("Plain", 300, 486, 1500, 525)], toPdf).items[0]!;
    expect(item.y).toBeCloseTo(PAGE_HEIGHT - (525 - 0.2 * 39) / DPI);
  });

  it("drops empty lines and lines it is unsure of, and averages the rest", () => {
    const out = fromOcr(
      [
        line("kept", 0, 0, 100, 20, 90),
        line("  ", 0, 30, 100, 50),
        line("noise", 0, 60, 100, 80, 5),
        line("kept too", 0, 90, 100, 110, 70),
      ],
      toPdf,
    );
    expect(out.items.map((i) => i.str)).toEqual(["kept", "kept too"]);
    expect(out.confidence).toBe(80);
  });

  it("has no confidence when nothing was read", () => {
    expect(fromOcr([], toPdf)).toEqual({ items: [], confidence: 0 });
  });

  it("gives the layout what it needs to find a heading and the paragraphs", () => {
    const lines = [
      line("Adapters for Small Language Models", 300, 210, 1394, 272, 96, 63.6),
      line("1 Introduction", 304, 386, 625, 426, 96, 49.4),
      line("Low-rank adaptation (LoRA) freezes the pretrained weights and injects small trainable", 303, 486, 1879, 525, 95, 39),
      line("matrices into every layer, which keeps the number of trainable parameters tiny. We study", 303, 536, 1939, 575, 95, 39),
      line("how this choice affects fine-tuning quality on small language models and report that the", 303, 586, 1903, 625, 95, 39),
      line("results hold across three model families.", 303, 636, 1039, 667, 95, 39.2),
      line("A second paragraph starts with an indent and compares the method with full fine-", 342, 786, 1836, 825, 95, 39),
      line("tuning on a comparable budget of trainable parameters. The gap stays small on every task", 300, 836, 1967, 875, 95, 39),
    ];
    const { items } = fromOcr(lines, toPdf);
    const layout = groupParagraphs(items);
    expect(layout.paragraphs.map((p) => p.heading)).toEqual([true, true, false, false]);
    expect(layout.paragraphs[2]!.items).toHaveLength(4);
    // "full fine-" ends a line inside a word, so the break hyphen goes.
    expect(layout.hyphenated).toEqual([6]);
  });
});

describe("isImagePage", () => {
  it("is a page with no characters at all", () => {
    expect(isImagePage(0)).toBe(true);
    expect(isImagePage(1)).toBe(false);
  });
});
