import type { PdfTextItem } from "./layout";

/** The part of a pdf.js text item the layout needs; marker items in the stream have no `str`. */
export interface RawTextItem {
  str?: string;
  width: number;
  transform: number[];
}

export interface LayoutItem extends PdfTextItem {
  /** Sideways text, such as the arXiv stamp in the margin. */
  rotated: boolean;
}

/** One entry per item that has a text, in the order pdf.js's text layer makes its spans. */
export function fromPdfJs(items: readonly RawTextItem[]): LayoutItem[] {
  return items
    .filter((i): i is RawTextItem & { str: string } => i.str !== undefined)
    .map((i) => {
      const [a = 1, b = 0, c = 0, d = 1, x = 0, y = 0] = i.transform;
      return { str: i.str, x, y, w: i.width, h: Math.hypot(c, d), rotated: Math.abs(b) > 0.1 * Math.abs(a) };
    });
}
