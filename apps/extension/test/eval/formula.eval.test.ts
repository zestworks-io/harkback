// @vitest-environment happy-dom
// Measures how well formulas are found and read on the real papers of the formula set, without a model, and checks the
// quality bars. HB_EVAL_REPORT=1 (pnpm eval:formula) prints the scores and every miss.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { texKey } from "@harkback/core";
import { describe, expect, it } from "vitest";
import { looksLikeMath, matchEquation, parseArxivHtml, type ArxivHtml } from "../../src/lib/pdf/formula-match";
import { extractPage, type ExtractedPage } from "../../src/lib/source/extract";
import { definitionsFor, formulaSelection, symbolsOf } from "../../src/lib/source/formula";
import { DEFINITIONS, SYMBOLS } from "./formula/cases";
import { PDF_LINES } from "./formula/pdf-lines";
import { PAPERS } from "./formula/papers.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "formula");
const report = process.env.HB_EVAL_REPORT === "1";

interface Score {
  hits: number;
  total: number;
  misses: string[];
}
const score = (): Score => ({ hits: 0, total: 0, misses: [] });
const count = (s: Score, ok: boolean, miss: string) => {
  s.total++;
  if (ok) s.hits++;
  else s.misses.push(miss);
};
const rate = (s: Score) => (s.total === 0 ? 1 : s.hits / s.total);

/** One paper's page loaded into the document, as the content script sees it. */
function load(id: string): { page: ExtractedPage; equation: (n: string) => Element | null } {
  const html = readFileSync(`${dir}/pages/${id}.html`, "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.documentElement.remove();
  document.appendChild(document.importNode(parsed.documentElement, true));
  const page = extractPage(document, `https://arxiv.org/html/${id}`);
  const equation = (n: string) =>
    [...document.querySelectorAll("table.ltx_equation, table.ltx_equationgroup")]
      .find((t) => t.querySelector(".ltx_tag_equation, .ltx_tag_equationgroup")?.textContent?.trim() === `(${n})`)
      ?.querySelector("math") ?? null;
  return { page, equation };
}

function contents(el: Node): Range {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r;
}

const shown = (el: Element) => {
  const copy = el.cloneNode(true) as Element;
  for (const a of copy.querySelectorAll("annotation, annotation-xml")) a.remove();
  return (copy.textContent ?? "").replace(/\s+/g, "");
};

const flat = (s: string) => s.replace(/\s+/g, "");

const formulas = score();
const symbols = score();
const prose = score();
const listed = score();
const defined = score();
const pdfNumbered = score();
const pdfBare = score();
const pdfWrong = score();
const pdfProse = score();

for (const paper of PAPERS) {
  const { page, equation } = load(paper.id);

  // Every row of a numbered display equation, selected whole: one <math>, or one per cell of an aligned row.
  for (const row of document.querySelectorAll("table.ltx_equation tr, table.ltx_equationgroup tr")) {
    const maths = [...row.querySelectorAll("math")];
    const table = row.closest("table[id]");
    const tags = table?.querySelectorAll(".ltx_tag_equation, .ltx_tag_equationgroup") ?? [];
    const tag = (row.querySelector(".ltx_tag_equation, .ltx_tag_equationgroup") ?? (tags.length === 1 ? tags[0] : null))?.textContent
      ?.trim()
      .replace(/^\(|\)$/g, "");
    if (maths.length === 0 || !tag) continue;
    const cells = maths.map((m) => (m.getAttribute("alttext") ?? "").replace(/\\displaystyle\s*/g, "").trim());
    const sel = formulaSelection(contents(row));
    // Right when it is a formula, not a symbol, holding every cell of the row in order.
    let at = 0;
    const whole = !!sel && sel.symbol === undefined && cells.every((c) => (at = sel.tex.indexOf(c, at)) >= 0 && (at += c.length) > 0);
    count(
      formulas,
      whole,
      `${paper.id} (${tag}): row read as ${sel ? (sel.symbol ? `symbol ${sel.symbol}` : `"${sel.tex.slice(0, 50)}"`) : "prose"}`,
    );
  }

  // Paragraphs of prose with one inline formula, selected whole: what the share of shown math decides (a paragraph with
  // several formulas is prose by rule). Guards the count against hidden markup such as arXiv's TeX annotations.
  for (const p of document.querySelectorAll("p.ltx_p")) {
    const maths = p.querySelectorAll("math");
    if (maths.length !== 1 || p.querySelector("table")) continue;
    const mathChars = [...maths].reduce((n, m) => n + shown(m).length, 0);
    const text = shown(p);
    if (text.length < 200 || mathChars / text.length > 0.3) continue;
    count(prose, formulaSelection(contents(p)) === null, `${paper.id}: prose read as a formula: "${(p.textContent ?? "").slice(0, 80)}…"`);
  }

  for (const c of SYMBOLS.filter((s) => s.paper === paper.id)) {
    const el = [...(equation(c.equation)?.querySelectorAll(c.element) ?? [])].find((e) => shown(e) === c.text);
    let range: Range | null = el ? contents(el) : null;
    if (el && c.part) {
      const text = el.firstChild as Text;
      range = document.createRange();
      range.setStart(text, text.data.indexOf(c.part));
      range.setEnd(text, text.data.indexOf(c.part) + c.part.length);
    }
    const sel = range ? formulaSelection(range) : null;
    count(
      symbols,
      !!sel?.symbol && texKey(sel.symbol) === texKey(c.symbol),
      `${paper.id} (${c.equation}) ${c.symbol}: ${el ? `read as ${sel?.symbol ?? "the whole formula"}` : "element not found"}`,
    );
  }

  for (const c of DEFINITIONS.filter((d) => d.paper === paper.id)) {
    const math = equation(c.equation);
    const tex = math?.getAttribute("alttext") ?? "";
    count(
      listed,
      symbolsOf(tex).some((s) => texKey(s) === texKey(c.symbol)),
      `${paper.id} (${c.equation}) ${c.symbol}: not among the symbols ${JSON.stringify(symbolsOf(tex))}`,
    );
    const defs = math ? definitionsFor(page, tex, math) : [];
    count(
      defined,
      defs.some((d) => flat(d.text).includes(flat(c.defines))),
      `${paper.id} (${c.equation}) ${c.symbol}: "${c.defines}" not among ${defs.length} sentences found`,
    );
  }

  // PDF lines of the paper against its HTML version.
  const html: ArxivHtml = parseArxivHtml(readFileSync(`${dir}/pages/${paper.id}.html`, "utf8"), `https://arxiv.org/html/${paper.id}`);
  for (const c of PDF_LINES.filter((l) => l.paper === paper.id)) {
    const selection = c.line.replace(/\(\s*\d+(?:\.\d+)*[a-z]?\s*\)\s*$/, "").trim();
    if (c.number === null) {
      const math = looksLikeMath(c.line, c.line) || matchEquation(c.line, c.line, html) !== null;
      count(pdfProse, !math, `${paper.id}: prose read as math: "${c.line.slice(0, 90)}"`);
      continue;
    }
    const withNumber = matchEquation(selection, c.line, html);
    count(
      pdfNumbered,
      withNumber?.number === c.number,
      `${paper.id} (${c.number}) with its number: ${withNumber ? `matched (${withNumber.number ?? "?"})` : "no match"}`,
    );
    const bare = matchEquation(selection, selection, html);
    count(
      pdfBare,
      bare?.number === c.number,
      `${paper.id} (${c.number}) by its characters: ${bare ? `matched (${bare.number ?? "unnumbered"})` : "no match"}`,
    );
    // Right when it is the labelled equation: its number, or a row of the same numbered table (an equation over several rows).
    // Right when it is the labelled equation: a numbered match by its number; an unnumbered one when it is a row of the
    // labelled equation's table that has no number of its own (an equation over several rows).
    const table = equation(c.number)?.closest("table[id]")?.id;
    for (const m of [withNumber, bare]) {
      if (m)
        count(
          pdfWrong,
          m.number !== undefined ? m.number === c.number : !!table && m.element.closest("table[id]")?.id === table,
          `${paper.id} (${c.number}): matched the wrong equation ${m.number ?? m.tex.slice(0, 40)}`,
        );
    }
  }
}

const SCORES: [string, Score][] = [
  ["HTML: equation row read as that formula", formulas],
  ["HTML: symbol read as that symbol", symbols],
  ["HTML: prose kept as prose", prose],
  ["Symbol listed for definitions", listed],
  ["Defining sentence found", defined],
  ["PDF: equation matched with its number", pdfNumbered],
  ["PDF: equation matched by characters", pdfBare],
  ["PDF: matches that are right", pdfWrong],
  ["PDF: prose kept as prose", pdfProse],
];

if (report) {
  const out = (line = "") => process.stdout.write(`${line}\n`);
  out("\nFormula evaluation (rule-based, no model)\n");
  for (const [name, s] of SCORES) out(`  ${name.padEnd(42)}${`${(rate(s) * 100).toFixed(1)}%`.padStart(7)}  ${s.hits}/${s.total}`);
  out("\nMisses");
  for (const [name, s] of SCORES) for (const m of s.misses) out(`  [${name}] ${m}`);
}

/** The bars below which a change does not ship. A wrong equation is never acceptable; the rest leave room for hard cases. */
describe("formula evaluation", () => {
  it("never matches a PDF selection to the wrong equation", () => expect(pdfWrong.misses).toEqual([]));
  it("reads display equations as formulas", () => expect(rate(formulas)).toBeGreaterThanOrEqual(0.95));
  it("keeps prose as prose on pages and in PDFs", () => {
    expect(rate(prose)).toBeGreaterThanOrEqual(0.95);
    expect(rate(pdfProse)).toBeGreaterThanOrEqual(0.95);
  });
  it("reads selected symbols, and finds them and their definitions", () => {
    expect(rate(symbols)).toBeGreaterThanOrEqual(0.85);
    expect(rate(listed)).toBeGreaterThanOrEqual(0.85);
    expect(rate(defined)).toBeGreaterThanOrEqual(0.9);
  });
  it("matches a PDF equation by the number beside it", () => expect(rate(pdfNumbered)).toBeGreaterThanOrEqual(0.95));
  it("labels only lines the papers' PDFs really have", () => {
    const missing = PDF_LINES.filter((c) => {
      const pdf = JSON.parse(readFileSync(path.join(dir, "pdf", `${c.paper}.json`), "utf8")) as { pages: string[][] };
      return !pdf.pages.flat().includes(c.line);
    });
    expect(missing).toEqual([]);
  });
});
