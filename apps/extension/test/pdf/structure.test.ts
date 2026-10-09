// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { extractPage } from "../../src/lib/source/extract";
import { structurePage } from "../../src/lib/pdf/dom";
import { groupParagraphs } from "../../src/lib/pdf/layout";
import { fromPdfJs, type RawTextItem } from "../../src/lib/pdf/text";

const fixtureDir = path.resolve(__dirname, "../../fixtures/pdf");
const fontDir = path.resolve(__dirname, "../../node_modules/pdfjs-dist/standard_fonts") + "/";

async function pageItems(file: string, n = 1): Promise<RawTextItem[]> {
  const data = new Uint8Array(readFileSync(path.join(fixtureDir, file)));
  const doc = await pdfjs.getDocument({ data, standardFontDataUrl: fontDir, verbosity: 0 }).promise;
  const page = await doc.getPage(n);
  return (await page.getTextContent()).items as RawTextItem[];
}

/** Builds what pdf.js's TextLayer does: one absolutely placed span per item that has a text, in a layer. */
function textLayerFor(items: RawTextItem[]): { layer: HTMLElement; spans: HTMLElement[] } {
  const layer = document.createElement("div");
  layer.className = "textLayer";
  const spans = items
    .filter((i) => i.str !== undefined)
    .map((i) => {
      const span = document.createElement("span");
      span.textContent = i.str!;
      return span;
    });
  for (const s of spans) if (s.textContent) layer.append(s);
  document.body.append(layer);
  return { layer, spans };
}

const blockTexts = (root: Element): string[] =>
  extractPage(document, "https://x.test/p.pdf", root).blocks.map((b) => b.el.textContent ?? "");

describe("fromPdfJs", () => {
  it("reads position, width and font size, and flags rotated text", async () => {
    const items = fromPdfJs(await pageItems("paper.pdf"));
    expect(items[0]).toMatchObject({ str: "Adapters for Small Language Models", x: 72, y: 730, h: 16, rotated: false });
    expect(fromPdfJs([{ str: "arXiv:1", width: 50, transform: [0, 10, -10, 0, 20, 100] }])[0]!.rotated).toBe(true);
  });

  it("drops markers that carry no text", () => {
    expect(fromPdfJs([{ width: 0, transform: [1, 0, 0, 1, 0, 0] } as RawTextItem])).toEqual([]);
  });
});

describe("real PDF text through the grouping", () => {
  it("finds the title, heading and paragraphs of a single column page", async () => {
    const items = fromPdfJs(await pageItems("paper.pdf"));
    const { paragraphs, hyphenated } = groupParagraphs(items);
    expect(paragraphs.map((p) => [p.items.filter((i) => items[i]!.str.trim()).length, p.heading])).toEqual([
      [1, true],
      [1, true],
      [4, false],
      [3, false],
    ]);
    expect(hyphenated).toHaveLength(1);
  });

  it("keeps the two columns apart and the indented paragraph separate", async () => {
    const items = fromPdfJs(await pageItems("columns.pdf"));
    const { paragraphs } = groupParagraphs(items);
    expect(paragraphs.map((p) => p.items.filter((i) => items[i]!.str.trim()).length)).toEqual([4, 3, 4]);
  });
});

describe("structurePage", () => {
  it("wraps each paragraph in a block, joins lines with spaces and mends hyphenated words", async () => {
    const raw = await pageItems("paper.pdf");
    const { layer, spans } = textLayerFor(raw);
    structurePage(layer, spans, raw);
    const blocks = blockTexts(layer);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toBe("Adapters for Small Language Models");
    expect(blocks[2]).toContain("trainable matrices into every layer");
    expect(blocks[2]).toContain("tiny. We study how this choice");
    expect(blocks[3]).toContain("with full fine tuning on a comparable budget".replace("fine tuning", "finetuning"));
    expect(layer.querySelectorAll("h2")).toHaveLength(2);
  });

  it("reads the columns one after the other", async () => {
    const raw = await pageItems("columns.pdf");
    const { layer, spans } = textLayerFor(raw);
    structurePage(layer, spans, raw);
    const blocks = blockTexts(layer);
    expect(blocks[0]).toBe(
      "The left column opens the page and explains attention in a few plain lines so that the reader can follow the rest of the argument without any detours.",
    );
    expect(blocks[2]).toMatch(/^The right column continues after the left one/);
  });

  it("hides rotated stamps and text the PDF marks as page furniture from the reader", () => {
    const raw: RawTextItem[] = [
      { str: "arXiv:2305.14314v1 [cs.LG] 23 May 2023", width: 200, transform: [0, 10, -10, 0, 20, 100] },
      { str: "Page 3", width: 30, transform: [10, 0, 0, 10, 300, 20] },
      { str: "Real text of the page.", width: 100, transform: [10, 0, 0, 10, 72, 700] },
    ];
    const { layer, spans } = textLayerFor(raw);
    const furniture = document.createElement("span");
    furniture.setAttribute("aria-hidden", "true");
    layer.insertBefore(furniture, spans[1]!);
    furniture.append(spans[1]!);
    structurePage(layer, spans, raw);
    expect(blockTexts(layer)).toEqual(["Real text of the page."]);
    expect(spans[0]!.getAttribute("aria-hidden")).toBe("true");
  });
});
