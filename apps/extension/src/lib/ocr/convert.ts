import type { OcrItem } from "./store";

/** One line of recognised text, in pixels of the rendered page with y downwards. */
export interface OcrLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
  /** Where the letters stand, at the left and right end of the line. */
  baseline?: { y0: number; y1: number };
  /** The line's height from the top of its tallest letters to the bottom of its lowest, as the font allows, not as the glyphs on it do. */
  rowHeight?: number;
}

/** Maps a point in rendered pixels to PDF units; the page viewport does this, and tests give a plain scale. */
export type ToPdf = (px: number, py: number) => [number, number];

const CJK = /[⺀-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-￯]/u;

/** Tesseract puts a space between the characters of Chinese and Japanese words; text does not have them. */
export function joinCjk(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  let out = "";
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i]!;
    if (c === " " && CJK.test(trimmed[i - 1] ?? "") && CJK.test(trimmed[i + 1] ?? "")) continue;
    out += c;
  }
  return out;
}

/** The height of a line's font is a little less than the row it takes. */
const FONT_OF_ROW = 0.9;
/** Without a measured baseline: where it sits above the bottom of the box. */
const DESCENT = 0.2;

/**
 * Turns recognised lines into the items of a text layer, in the order they were read. Lines with no text, or too
 * unsure to be worth selecting, are dropped; the second value is the mean confidence of the lines that stay.
 *
 * The size of a line comes from its row height and not from the box around its glyphs, which is shorter on a line
 * with no tall or hanging letters; the layout compares sizes to find headings and breaks between paragraphs.
 */
export function fromOcr(lines: readonly OcrLine[], toPdf: ToPdf, minConfidence = 20): { items: OcrItem[]; confidence: number } {
  const items: OcrItem[] = [];
  let total = 0;
  for (const line of lines) {
    const str = joinCjk(line.text);
    if (!str || line.confidence < minConfidence) continue;
    const { x0, y0, x1, y1 } = line.bbox;
    const row = line.rowHeight && line.rowHeight > 0 ? line.rowHeight : y1 - y0;
    const base = line.baseline ? (line.baseline.y0 + line.baseline.y1) / 2 : y1 - DESCENT * row;
    const [left, baseline] = toPdf(x0, base);
    const [right] = toPdf(x1, base);
    const [, above] = toPdf(x0, base - row);
    const height = Math.abs(above - baseline);
    if (height <= 0 || right <= left) continue;
    items.push({ str, x: left, y: baseline, w: right - left, h: FONT_OF_ROW * height });
    total += line.confidence;
  }
  return { items, confidence: items.length ? total / items.length : 0 };
}

/** A page has no text of its own when pdf.js found no characters on it. */
export const isImagePage = (chars: number): boolean => chars === 0;

/** Below this many characters a page that also draws a picture is taken for a scan with a little real text on it (a stamp, a title). */
export const SPARSE_TEXT = 150;
