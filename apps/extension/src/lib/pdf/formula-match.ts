import { extractPage, type ExtractedPage } from "../source/extract";
import { join, tagNumber, TAGS, texOfCell } from "../source/formula";
import { SYMBOLS } from "../ui/math";

/** A formula of the arXiv HTML version, with its source and the number printed beside it. */
export interface HtmlEquation {
  tex: string;
  number?: string;
  /** The first `<math>` of the equation; the whole equation when `single`. */
  element: Element;
  /** Whether the equation is one `<math>`; an aligned row is several, one per cell. */
  single: boolean;
}

export interface ArxivHtml {
  doc: Document;
  page: ExtractedPage;
  equations: HtmlEquation[];
}

export function parseArxivHtml(html: string, url: string): ArxivHtml {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const page = extractPage(doc, url);
  const equations: HtmlEquation[] = [];
  const seen = new Set<Element>();
  // A display equation is a row: LaTeXML splits an aligned row into one <math> per cell and numbers each row on its own.
  for (const row of page.root.querySelectorAll("table.ltx_equation tr, table.ltx_equationgroup tr")) {
    const maths = [...row.querySelectorAll("math")];
    if (maths.length === 0) continue;
    for (const m of maths) seen.add(m);
    const tex = join(maths.map(texOfCell));
    if (!tex) continue;
    // A table with one number drawn across its rows (a group's tag, or a row of its own) gives it to each row.
    const tags = [...(row.closest("table[id]")?.querySelectorAll(TAGS) ?? [])];
    const cell = tags[0]?.closest("td");
    const shared = tags.length === 1 && (Number(cell?.getAttribute("rowspan") ?? 1) > 1 || !cell?.closest("tr")?.querySelector("math"));
    const number = tagNumber(row.querySelector(TAGS) ?? (shared ? tags[0] : null));
    // A row that starts with a relation and has no number of its own continues the row above (aligned "= …" lines).
    const previous = equations.at(-1);
    if (
      !number &&
      /^(?:=|<|>|\\(?:leq?|geq?|approx|equiv|propto|sim)(?![A-Za-z]))/.test(tex) &&
      previous?.element.closest("table") === row.closest("table")
    ) {
      previous.tex += tex;
      previous.single = false;
      continue;
    }
    equations.push({ tex, element: maths[0]!, single: maths.length === 1, ...(number ? { number } : {}) });
  }
  for (const math of page.root.querySelectorAll("math")) {
    if (seen.has(math)) continue;
    const tex = texOfCell(math);
    if (tex) equations.push({ tex, element: math, single: true });
  }
  return { doc, page, equations };
}

/** Characters that carry a formula, the same whether it came from LaTeX or from a PDF's text. */
const KEEP = /[\p{L}\p{N}=+\-∑∏∫√<>≤≥≈∈∂∇]/u;
const SKELETON_CHARS = 300;

function skeletonOfTex(tex: string): string {
  const spelled = tex.replace(/\\([A-Za-z]+)/g, (_, name: string) => {
    if (name === "sqrt") return "√";
    const ch = SYMBOLS[name];
    return ch && ch.trim().length === 1 ? ch : "";
  });
  return skeleton(spelled);
}

function skeleton(text: string): string {
  let out = "";
  for (const c of text.normalize("NFKC").replace(/[−–]/g, "-")) if (KEEP.test(c)) out += c;
  return out.slice(0, SKELETON_CHARS);
}

function lcs(a: string, b: string): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, row[j - 1]!);
    prev = row;
  }
  return prev[b.length]!;
}

const NUMBER_AT_END = /\(\s*(\d+(?:\.\d+)*[a-z]?)\s*\)\s*$/;
/** How alike the best equation must be, and by how much it must beat the next one. */
const MIN_SCORE = 0.6;
const MIN_LEAD = 0.1;
/** The same, when the line gives no equation number. */
const MIN_SCORE_BARE = 0.7;
const MIN_LEAD_BARE = 0.2;

/**
 * The equation of the HTML version a PDF selection is. `line` is the PDF line the selection ends on, which may end with the
 * equation number. Null unless one equation is a clear winner: a wrong formula is worse than none.
 */
export function matchEquation(selection: string, line: string, html: ArxivHtml): HtmlEquation | null {
  const number = equationNumber(line);
  if (number) {
    const numbered = html.equations.filter((e) => e.number === number);
    if (numbered.length === 1) return numbered[0]!;
  }
  const want = skeleton(selection.replace(NUMBER_AT_END, ""));
  if (want.length < 3) return null;
  // Without a number to go by, a fragment that several equations share must not be taken for one of them.
  const minScore = number ? MIN_SCORE : MIN_SCORE_BARE;
  const minLead = number ? MIN_LEAD : MIN_LEAD_BARE;
  // A paper has thousands of inline formulas. The score is at most the shorter length over the longer, so an equation
  // whose length rules out reaching the runner-up's bar is not compared character by character.
  const floor = minScore - minLead;
  const scored = html.equations
    .map((e) => {
      const have = skeletonOfTex(e.tex);
      const longer = Math.max(want.length, have.length);
      if (!have || Math.min(want.length, have.length) / longer < floor) return { e, score: 0 };
      return { e, score: lcs(want, have) / longer };
    })
    .sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || best.score < minScore) return null;
  if (next && best.score - next.score < minLead) return null;
  return best.e;
}

/** Characters only formulas use; brackets and hyphens are prose too. */
const MATH_SYMBOL = /[=+−∑∏∫√<>≤≥≈∈∂∇·×/^_|\p{Script=Greek}]|(?<![A-Za-z])-(?![A-Za-z])/u;
/** The share of a selection's characters that must read as math. */
const MATH_SHARE = 0.4;
const SHORT_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "we",
  "us",
  "so",
  "al",
]);

/**
 * The equation number a PDF line ends with, such as "(3)" or "(2.1a)"; null for what only looks like one: a year, a
 * reference to an equation ("Eq. (1)"), or a number after prose rather than after a formula.
 */
export function equationNumber(line: string): string | null {
  const m = NUMBER_AT_END.exec(line);
  if (!m) return null;
  const number = m[1]!;
  if (Number.parseInt(number, 10) >= 1000) return null;
  const before = line.slice(0, m.index);
  if (/(?:eqs?|equations?|al|sec|section|fig|figure|table|step|line)\.?\s*$/i.test(before)) return null;
  return MATH_SYMBOL.test(before) ? number : null;
}

/**
 * Whether a PDF selection reads as a formula: on a line that ends with an equation number, or holding a character only
 * formulas use and made mostly of such characters and one-letter names. Acronyms (RNN, GPT-4) and citations are prose.
 */
export function looksLikeMath(selection: string, line: string): boolean {
  if (equationNumber(line) !== null && MATH_SYMBOL.test(selection.replace(/\s/g, "") + line)) return selection.trim() !== "";
  const text = selection.replace(/\s+/g, "");
  if (!text || !MATH_SYMBOL.test(text)) return false;
  let math = 0;
  for (const c of text) if (MATH_SYMBOL.test(c)) math++;
  // With a formula's character present, short names count as its symbols (QKT, dk, V); common short words do not.
  for (const word of selection.match(/[A-Za-z]+/g) ?? []) if (word.length <= 3 && !SHORT_WORDS.has(word.toLowerCase())) math += word.length;
  // So do function names written right before their bracket: Attention(, softmax(.
  for (const call of selection.match(/[A-Za-z]{4,}(?=\()/g) ?? []) math += call.length;
  return math / text.length >= MATH_SHARE;
}
