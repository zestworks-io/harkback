import type { FormulaPick } from "../content/app";
import type { ExtractedPage } from "../source/extract";
import { definitionsFor } from "../source/formula";
import type { HtmlLookup } from "./arxiv-html";
import { looksLikeMath, matchEquation } from "./formula-match";

/** A selection shorter than this is a formula only when its line carries an equation number. */
const MIN_CHARS = 3;
const NUMBERED = /\(\s*\d+(?:\.\d+)*[a-z]?\s*\)\s*$/;

/**
 * The text of the PDF line `node` is on: the spans of its page whose middles lie within half a line of its own. pdf.js
 * places spans in percent of the page, where neighbouring lines are only a percent or two apart, so drawn boxes decide;
 * without them (nothing laid out) the same position does.
 */
export function lineOf(node: Node): string {
  const span = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest("span");
  // The whole page's text: pdf.js may put a display equation and its number in different paragraphs.
  const layer = span?.closest(".textLayer") ?? span?.parentElement;
  if (!span || !layer) return node.textContent ?? "";
  const spans = [...layer.querySelectorAll("span")].filter((s) => !s.querySelector("span"));
  const box = span.getBoundingClientRect();
  if (box.height <= 0) {
    return spans
      .filter((s) => (s as HTMLElement).style.top === span.style.top)
      .map((s) => s.textContent ?? "")
      .join(" ");
  }
  let line = spans.filter((s) => {
    const r = s.getBoundingClientRect();
    return Math.abs(r.top + r.height / 2 - (box.top + box.height / 2)) < box.height / 2;
  });
  // Two columns: when nothing on the line crosses the middle of the page, the other column's text at the same height is
  // another line (a prose line beside a numbered equation must not take its number).
  const page = layer.getBoundingClientRect();
  const middle = page.left + page.width / 2;
  if (page.width > 0 && !line.some((s) => s.getBoundingClientRect().left < middle && s.getBoundingClientRect().right > middle)) {
    const left = box.left + box.width / 2 < middle;
    line = line.filter((s) => {
      const r = s.getBoundingClientRect();
      return r.left + r.width / 2 < middle === left;
    });
  }
  return line.map((s) => s.textContent ?? "").join(" ");
}

/**
 * The formula a selection in the PDF reader is. For an arXiv paper, the matching equation of its HTML version, with that
 * version's text for the symbols' definitions. Otherwise the PDF's own characters, marked as possibly inexact; their
 * definitions are not looked for, since symbols cannot be told apart in loose characters.
 */
export function pdfFormula(arxivId: string | null, lookup: (id: string) => Promise<HtmlLookup>) {
  /** `mayLookUp`: whether arXiv may be asked about this paper (a normal source, in a normal window). */
  return async (range: Range, _page: ExtractedPage, mayLookUp: () => Promise<boolean>): Promise<FormulaPick | null> => {
    const selection = range.toString().replace(/\s+/g, " ").trim();
    const line = lineOf(range.endContainer);
    if (!looksLikeMath(selection, line)) return null;
    if (selection.replace(/\s/g, "").length < MIN_CHARS && !NUMBERED.test(line)) return null;
    if (arxivId && (await mayLookUp())) {
      const found = await lookup(arxivId);
      const eq = found.kind === "ok" ? matchEquation(selection, line, found.html) : null;
      if (found.kind === "ok" && eq) {
        return {
          request: { tex: eq.tex, definitions: definitionsFor(found.html.page, eq.tex, eq.element) },
          view: { tex: eq.tex, ...(eq.single ? { original: eq.element } : {}) },
          quotesOnPage: false,
        };
      }
    }
    return {
      request: { tex: selection, definitions: [], approximate: true },
      view: { tex: selection, note: "pdf_text" },
      quotesOnPage: true,
    };
  };
}
