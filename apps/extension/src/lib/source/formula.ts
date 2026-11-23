import { symbolMatcher, texKey, type FormulaDefinition } from "@harkback/core";
import { SYMBOLS } from "../ui/math";
import type { ExtractedPage } from "./extract";

/** A selected formula, or one symbol of it, with the formula's LaTeX as the page gives it. */
export interface FormulaSelection {
  tex: string;
  /** Set when one symbol was selected: that symbol, as LaTeX. */
  symbol?: string;
  /** The page's `<math>` element. */
  element: Element;
  /** The equation number printed beside a display equation, without brackets. */
  number?: string;
}

const GREEK = new Set([
  ...Object.entries(SYMBOLS)
    .filter(([, v]) => /^\p{Script=Greek}$/u.test(v))
    .map(([k]) => k),
  "vartheta",
  "varrho",
  "varsigma",
  "varpi",
  "upsilon",
  "Upsilon",
]);
/** Unicode → LaTeX command, the first name listed winning (`epsilon` over `varepsilon`). */
const COMMAND_OF = new Map<string, string>();
for (const [name, ch] of Object.entries(SYMBOLS))
  if (/^[A-Za-z]+$/.test(name) && ch.trim() && !COMMAND_OF.has(ch)) COMMAND_OF.set(ch, name);
// LaTeX draws \phi as ϕ and \varphi as φ, \epsilon as ϵ and \varepsilon as ε; MathML keeps the drawn letter.
for (const [ch, name] of [
  ["ϕ", "phi"],
  ["φ", "varphi"],
  ["ϵ", "epsilon"],
  ["ε", "varepsilon"],
  ["ϑ", "vartheta"],
  ["ϱ", "varrho"],
  ["ς", "varsigma"],
  ["ϖ", "varpi"],
  ["υ", "upsilon"],
] as const)
  COMMAND_OF.set(ch, name);
/** Accents MathML draws over a letter, by the LaTeX command that makes them. */
const ACCENTS: Record<string, string> = {
  "^": "hat",
  ˆ: "hat",
  "̂": "hat",
  "~": "tilde",
  "˜": "tilde",
  "¯": "bar",
  "‾": "bar",
  "→": "vec",
  "˙": "dot",
  "¨": "ddot",
};
/** Commands that style or accent one letter, which with it is a symbol of its own (\mathbf{X}, \hat{r}). */
const STYLED = new Set(
  "mathbf bm boldsymbol mathcal mathbb mathit mathsf mathfrak mathscr mathtt hat widehat tilde widetilde bar overline vec dot ddot check breve".split(
    " ",
  ),
);
/** Commands whose argument is a word, not symbols. */
const WORDS = new Set("mathrm text textrm textit textbf operatorname mbox".split(" "));
/** Words LaTeX has a command for; any other word is written upright with `\mathrm`. */
const LATEX_OPERATORS = new Set("log ln exp sin cos tan max min arg lim sup inf det Pr dim ker".split(" "));
export const SCRIPTED = new Set("msub msup msubsup munder mover munderover".split(" "));

/** Joins LaTeX pieces, keeping a command apart from a letter after it (`\sigma x`, not `\sigmax`). */
export function join(parts: string[]): string {
  let out = "";
  for (const p of parts) out += /\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(p) ? ` ${p}` : p;
  return out;
}

/** A letter of Unicode's mathematical alphabets: bold as \mathbf, bold italic as \bm, any other style as the plain letter. */
function mathLetter(ch: string): string | null {
  const cp = ch.codePointAt(0) ?? 0;
  const letterlike = LETTERLIKE[ch];
  if (letterlike) return letterlike;
  if (cp < 0x1d400 || cp > 0x1d7ff) return null;
  // Each Greek alphabet ends in the variant letters ∂ ϵ ϑ ϰ ϕ ϱ ϖ, which NFKC would fold into ∂ ε θ κ φ ρ π.
  const greek = cp >= 0x1d6a8 && cp <= 0x1d7c9 ? (cp - 0x1d6a8) % 58 : -1;
  const plain = greek >= 51 ? "∂ϵϑϰϕϱϖ"[greek - 51]! : ch.normalize("NFKC");
  const letter = COMMAND_OF.has(plain) ? `\\${COMMAND_OF.get(plain)}` : plain;
  const style = ALPHABETS.find(([from, to]) => cp >= from && cp <= to)?.[2];
  return style ? `\\${style}{${letter}}` : letter;
}

/** Unicode's mathematical alphabets and the LaTeX command of each; italic and plain letters need none. */
const ALPHABETS: readonly (readonly [number, number, string])[] = [
  [0x1d400, 0x1d433, "mathbf"],
  [0x1d468, 0x1d49b, "bm"],
  [0x1d49c, 0x1d503, "mathcal"],
  [0x1d504, 0x1d537, "mathfrak"],
  [0x1d538, 0x1d56b, "mathbb"],
  [0x1d56c, 0x1d59f, "mathfrak"],
  [0x1d5a0, 0x1d66f, "mathsf"],
  [0x1d670, 0x1d6a3, "mathtt"],
  [0x1d6a8, 0x1d6e1, "mathbf"],
  [0x1d71c, 0x1d755, "bm"],
  [0x1d756, 0x1d7c9, "mathsf"],
  [0x1d7ce, 0x1d7d7, "mathbf"],
  [0x1d7d8, 0x1d7e1, "mathbb"],
  [0x1d7e2, 0x1d7f5, "mathsf"],
  [0x1d7f6, 0x1d7ff, "mathtt"],
];
/** Letters of those alphabets that Unicode keeps in the Letterlike Symbols block instead. */
const LETTERLIKE: Record<string, string> = Object.fromEntries(
  (
    [
      ["ℬℰℱℋℐℒℳℛℯℊℴ", "mathcal"],
      ["ℂℍℕℙℚℝℤ", "mathbb"],
      ["ℭℌℑℜℨ", "mathfrak"],
    ] as const
  ).flatMap(([letters, style]) => [...letters].map((c) => [c, `\\${style}{${c.normalize("NFKC")}}`])),
);

function token(text: string): string {
  const s = text.trim().replace(/−/g, "-");
  if ([...s].length === 1) {
    const styled = mathLetter(s);
    if (styled) return styled;
    const cmd = COMMAND_OF.get(s);
    return cmd ? `\\${cmd}` : s;
  }
  return s;
}

/** LaTeX for a MathML subtree, for the forms LaTeXML writes. */
export function texOfMathml(el: Element): string {
  const kids = [...el.children];
  const arg = (i: number): string => (kids[i] ? texOfMathml(kids[i]) : "");
  switch (el.localName) {
    case "semantics":
      return kids[0] ? texOfMathml(kids[0]) : "";
    case "annotation":
    case "annotation-xml":
      return "";
    case "mi": {
      const s = (el.textContent ?? "").trim();
      if ([...s].length <= 1) return token(s);
      // LaTeXML runs styled letters together (𝐖𝐗 for \mathbf{W}\mathbf{X}): each is a symbol of its own.
      if ([...s].every((c) => mathLetter(c) !== null)) return join([...s].map(token));
      return LATEX_OPERATORS.has(s) ? `\\${s}` : `\\mathrm{${s}}`;
    }
    case "mn":
    case "mo":
    case "mtext":
      return token(el.textContent ?? "");
    case "msub":
    case "munder":
      return `${arg(0)}_{${arg(1)}}`;
    case "mover": {
      const accent = ACCENTS[(kids[1]?.textContent ?? "").trim()];
      if (accent && (el.getAttribute("accent") === "true" || kids[1]?.localName === "mo")) return `\\${accent}{${arg(0)}}`;
      return `${arg(0)}^{${arg(1)}}`;
    }
    case "msup":
      return `${arg(0)}^{${arg(1)}}`;
    case "msubsup":
    case "munderover":
      return `${arg(0)}_{${arg(1)}}^{${arg(2)}}`;
    case "mfrac":
      return `\\frac{${arg(0)}}{${arg(1)}}`;
    case "msqrt":
      return `\\sqrt{${join(kids.map(texOfMathml))}}`;
    case "mroot":
      return `\\sqrt[${arg(1)}]{${arg(0)}}`;
    default:
      return join(kids.map(texOfMathml));
  }
}

/** The end of a `{…}` group starting at `i`, or of one token. */
function groupEnd(tex: string, i: number): number {
  if (tex[i] === "{") {
    for (let depth = 0, j = i; j < tex.length; j++) {
      if (tex[j] === "{") depth++;
      else if (tex[j] === "}" && --depth === 0) return j + 1;
    }
    return tex.length;
  }
  if (tex[i] === "\\") {
    const m = /^\\[A-Za-z]+/.exec(tex.slice(i));
    return i + (m ? m[0].length : 2);
  }
  return Math.min(tex.length, i + 1);
}

/** Identifiers of a formula with their sub- and superscripts, in order of first appearance: `["Q", "K^T", "d_k", "V"]`. */
export function symbolsOf(tex: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tex.length;) {
    let end = -1;
    if (tex[i] === "\\") {
      const name = /^\\([A-Za-z]+)/.exec(tex.slice(i))?.[1];
      if (!name) {
        i += 2;
        continue;
      }
      i += name.length + 1;
      if (WORDS.has(name)) {
        while (tex[i] === " ") i++;
        if (tex[i] === "{") i = groupEnd(tex, i);
        continue;
      }
      if (STYLED.has(name)) {
        let j = i;
        while (tex[j] === " ") j++;
        if (tex[j] !== "{") continue;
        end = groupEnd(tex, j);
        i -= name.length + 1;
      } else {
        if (!GREEK.has(name)) continue;
        end = i;
        i -= name.length + 1;
      }
    } else if (/[A-Za-z]/.test(tex[i]!)) {
      end = i + 1;
    } else {
      i++;
      continue;
    }
    while (tex[end] === "_" || tex[end] === "^" || tex[end] === "'") end = tex[end] === "'" ? end + 1 : groupEnd(tex, end + 1);
    // Powers and inverses are operations on the symbol, not part of its name: H_F^{-1} is H_F.
    const symbol = tex.slice(i, end).replace(/\^(?:\{\s*-?\d+\s*\}|\d)/g, "");
    if (!seen.has(texKey(symbol))) {
      seen.add(texKey(symbol));
      out.push(symbol);
    }
    i = end;
  }
  return out;
}

function nonSpace(s: string): number {
  return s.replace(/\s/g, "").length;
}

/** Characters of a range as the reader sees them: the TeX source arXiv keeps in an annotation is not shown, so not counted. */
function shownCharacters(range: Range, math: Element): { total: number; inMath: number } {
  const root = range.commonAncestorContainer;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let inMath = 0;
  for (let n = root.nodeType === Node.TEXT_NODE ? root : walk.nextNode(); n; n = walk.nextNode()) {
    const textNode = n as Text;
    if (!range.intersectsNode(textNode) || textNode.parentElement?.closest("annotation, annotation-xml")) continue;
    const from = textNode === range.startContainer ? range.startOffset : 0;
    const to = textNode === range.endContainer ? range.endOffset : textNode.data.length;
    const count = nonSpace(textNode.data.slice(from, to));
    total += count;
    if (math.contains(textNode)) inMath += count;
    if (root.nodeType === Node.TEXT_NODE) break;
  }
  return { total, inMath };
}

function asElement(n: Node): Element | null {
  return n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;
}

/** The share of a range's text a formula must hold for the selection to be read as that formula. */
const MATH_SHARE = 0.6;

/** Where LaTeXML prints an equation's number: one equation, or a group of rows under one number. */
export const TAGS = ".ltx_tag_equation, .ltx_tag_equationgroup";
/** A display equation's row; LaTeXML splits an aligned row into one <math> per cell. */
const ROW = "table.ltx_equation tr, table.ltx_equationgroup tr";

/** The number a tag prints, without brackets. */
export function tagNumber(tag: Element | null | undefined): string | undefined {
  return /^\(?\s*(.+?)\s*\)?$/.exec(tag?.textContent?.trim() ?? "")?.[1];
}

/** The number printed beside the display equation `el` is in. */
function numberOf(el: Element): string | undefined {
  return tagNumber(el.closest("tr")?.querySelector(TAGS) ?? el.closest("table.ltx_equation, table.ltx_equationgroup")?.querySelector(TAGS));
}

/** A <math>'s LaTeX as the page gives it, without the display style LaTeXML adds to aligned cells. */
export function texOfCell(math: Element): string {
  return (math.getAttribute("alttext")?.trim() || texOfMathml(math)).replace(/\\displaystyle\s*/g, "").trim();
}

/** A row of an aligned equation, read as one formula: its cells' LaTeX joined. */
function rowSelection(row: Element, maths: Element[]): FormulaSelection | null {
  const tex = join(maths.map(texOfCell));
  if (!tex) return null;
  const number = numberOf(row);
  return { tex, element: maths[0]!, ...(number ? { number } : {}) };
}

/**
 * The formula a selection is, or the symbol of one; null when the selection is prose, even prose with a little math in it.
 * Reads LaTeXML's markup: `<math alttext>`, and display equations in `table.ltx_equation` with their number beside them.
 */
export function formulaSelection(range: Range): FormulaSelection | null {
  const common = asElement(range.commonAncestorContainer);
  if (!common) return null;
  const inside = common.closest("math");
  let math: Element;
  if (inside) {
    math = inside;
  } else {
    const hits = [...common.querySelectorAll("math")].filter((m) => range.intersectsNode(m));
    const row = hits[0]?.closest(ROW);
    // A whole aligned equation: one row of a display equation, which LaTeXML splits into a <math> per cell.
    if (hits.length > 1 && row && hits.every((m) => m.closest("tr") === row)) return rowSelection(row, hits);
    if (hits.length !== 1) return null;
    math = hits[0]!;
    const shown = shownCharacters(range, math);
    if (shown.total === 0 || shown.inMath / shown.total < MATH_SHARE) return null;
  }
  const cell = texOfCell(math);
  if (!cell) return null;
  // A cell of an aligned row is half an equation: the formula is the whole row.
  const cells = [...(math.closest(ROW)?.querySelectorAll("math") ?? [])];
  const tex = cells.length > 1 ? join(cells.map(texOfCell)) : cell;
  const number = numberOf(math);
  const sel: FormulaSelection = { tex, element: math, ...(number ? { number } : {}) };
  if (!inside) return sel;

  // One identifier selected, or a letter of one: climb to the identifier with its scripts.
  let node: Element | null = common;
  // Climbs from a letter to its symbol with scripts (d of d_k, or its k), but not out of the limits of max or sum.
  const LIMITS = new Set(["munder", "mover", "munderover"]);
  while (node && node !== math && node.parentElement && SCRIPTED.has(node.parentElement.localName)) {
    const parent: Element = node.parentElement;
    if (parent.firstElementChild !== node) {
      // A script of max, sum or a word such as argmin is an expression of its own, not part of that operator's name.
      const base = parent.firstElementChild;
      const word = !!base && (base.localName === "mtext" || base.localName === "mo" || [...(base.textContent ?? "").trim()].length > 1);
      if (LIMITS.has(parent.localName) || word) break;
    }
    node = parent;
  }
  if (!node || node === math || !(node.localName === "mi" || SCRIPTED.has(node.localName))) {
    // The whole of a formula that is one symbol, such as an inline d_k.
    const only = symbolsOf(cell);
    return only.length === 1 && texKey(only[0]!) === texKey(cell) ? { ...sel, symbol: cell } : sel;
  }
  // Part of a run of letters in one element (the 𝐖 of 𝐖𝐗): the selected letters are the symbol.
  if (
    node.localName === "mi" &&
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE &&
    range.toString().trim() !== (node.textContent ?? "").trim()
  ) {
    const part = token(range.toString());
    const one = symbolsOf(part);
    if (one.length === 1 && texKey(one[0]!) === texKey(part)) return { ...sel, symbol: part };
  }
  const symbol = texOfMathml(node);
  const found = symbolsOf(symbol);
  // symbolsOf leaves powers out of a name (H^{-1} is H): one symbol found in the selection is the symbol selected.
  const bare = symbol.replace(/\^(?:\{\s*-?\d+\s*\}|\d)/g, "");
  return found.length === 1 && texKey(found[0]!) === texKey(bare) ? { ...sel, symbol: found[0]! } : sel;
}

const CUE = /\b(where|denotes?|let|is the|are the|be the|we write|notation|stands? for|represents?)\b/i;
const NOTATION_SECTION = /notation|preliminar|background|problem (setup|setting|formulation)|definitions?/i;
const PER_SYMBOL = 3;
const MAX_CHARS = 4000;
const MAX_SENTENCE = 600;

/**
 * Sentences of the page that may define the symbols of `tex`, best first: those with a defining cue ("let", "denote",
 * "where"), in a notation section, before the formula, and the "where …" sentence right after a display equation.
 * `at` is the formula's element on the page.
 */
export function definitionsFor(page: ExtractedPage, tex: string, at?: Element): FormulaDefinition[] {
  const symbols = symbolsOf(tex);
  if (symbols.length === 0) return [];
  const atIndex = at ? page.blocks.findIndex((b) => b.el === at || b.el.contains(at)) : -1;
  const display = at?.getAttribute("display") === "block";
  type Candidate = { text: string; score: number; order: number };
  const sentences: Candidate[] = [];
  page.blocks.forEach((b, i) => {
    if (b.code || i === atIndex) return;
    const text = page.text.slice(b.start, b.end).replace(/\s+/g, " ").trim();
    if (!text) return;
    // The first prose after a display equation, past its number.
    const afterEquation =
      display &&
      i > atIndex &&
      atIndex >= 0 &&
      page.blocks.slice(atIndex + 1, i).every((x) => /^\(?[\w.]+\)?$/.test(page.text.slice(x.start, x.end).trim()));
    text.split(/(?<=[.!?;:])\s+(?=[A-Z\\(]|where\b)/).forEach((s, k) => {
      const sentence = s.slice(0, MAX_SENTENCE);
      let score = 0;
      if (CUE.test(sentence)) score += 2;
      if (NOTATION_SECTION.test(b.section)) score += 2;
      if (atIndex >= 0 && i < atIndex) score += 1;
      if (afterEquation && k === 0 && /^where\b/i.test(sentence)) score += 3;
      sentences.push({ text: sentence, score, order: sentences.length });
    });
  });
  const picked = new Set<Candidate>();
  // The page often names a symbol without the scripts the formula gives it, or with others: c for c^{FP32}, X_ℓ for X.
  const base = (symbol: string) => symbol.replace(/[_^](\{(?:[^{}]|\{[^{}]*\})*\}|\\[A-Za-z]+|.)/g, "");
  for (const symbol of symbols) {
    const find = (test: (text: string) => boolean) =>
      sentences
        .filter((s) => s.score > 0 && test(s.text))
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .slice(0, PER_SYMBOL);
    let best = find(symbolMatcher(symbol));
    if (best.length === 0) best = find(symbolMatcher(base(symbol), { scripted: true }));
    for (const s of best) picked.add(s);
  }
  const out: FormulaDefinition[] = [];
  let chars = 0;
  for (const s of [...picked].sort((a, b) => b.score - a.score || a.order - b.order)) {
    if (chars + s.text.length > MAX_CHARS) continue;
    if (out.some((d) => d.text === s.text)) continue;
    chars += s.text.length;
    out.push({ id: `d${out.length + 1}`, text: s.text });
  }
  return out;
}
