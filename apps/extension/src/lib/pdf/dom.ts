import { groupParagraphs } from "./layout";
import { fromPdfJs, type RawTextItem } from "./text";

/**
 * Turns the loose spans of a pdf.js text layer into paragraphs the page reader understands:
 * each paragraph becomes a block (headings become <h2>), lines are joined with spaces, and a word
 * broken by a hyphen at the end of a line is joined again. The spans keep their absolute positions.
 * `spans` and `raw` are the layer's spans and the text items they were made from, in the same order.
 */
export function structurePage(layer: HTMLElement, spans: readonly HTMLElement[], raw: readonly RawTextItem[]): void {
  const items = fromPdfJs(raw);
  const doc = layer.ownerDocument;
  const included: number[] = [];
  items.forEach((item, i) => {
    const span = spans[i];
    if (!span) return;
    // Margin stamps are not part of the text; pages the PDF tags as furniture (headers, page numbers) stay hidden.
    if (item.rotated) span.setAttribute("aria-hidden", "true");
    if (!item.rotated && !span.closest('[aria-hidden="true"]')) included.push(i);
  });

  const layout = groupParagraphs(included.map((i) => items[i]!));
  const hyphenated = new Set(layout.hyphenated.map((k) => included[k]!));
  const spaced = new Set(layout.spaceAfter.map((k) => included[k]!));
  for (const paragraph of layout.paragraphs) {
    const block = doc.createElement(paragraph.heading ? "h2" : "p");
    // pdf.js styles only spans directly in the layer or in a marked-content wrapper; this class draws no box of its own.
    block.className = "markedContent";
    layer.append(block);
    for (const k of paragraph.items) {
      const i = included[k]!;
      const span = spans[i]!;
      if (hyphenated.has(i)) span.textContent = (span.textContent ?? "").replace(/-$/, "");
      block.append(span);
      if (spaced.has(i)) block.append(doc.createTextNode(" "));
    }
  }
}
