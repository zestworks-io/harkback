import { texKey, type FormulaResult, type FormulaSymbol } from "@harkback/core";
import { SCRIPTED, texOfMathml } from "../source/formula";
import { h } from "./dom";
import { renderMath } from "./math";
import { t, type Lang } from "./strings";

/** How a formula's card is shown. */
export interface FormulaView {
  tex: string;
  /** Set for the card of one symbol. */
  symbol?: string;
  /** The page's own `<math>`, shown as it is; without it the LaTeX is typeset. */
  original?: Element;
  /** "pdf_text": the formula was read from a PDF's text, so the card says it may be inexact. */
  note?: "pdf_text";
  /** Scrolls to a quote on the page; absent when the quote is not on the page shown (the PDF's HTML version). */
  showOnPage?: (quote: string) => void;
  /** On the card of one symbol: explain the formula it is in. */
  onExplainWhole?: () => void;
}

const SOURCE_LABEL = { page: "symbolDefined", standard: "symbolStandard", none: "symbolUndefined" } as const;

const MATHML = "http://www.w3.org/1998/Math/MathML";
/** Presentation MathML: what is drawn, and nothing that links, loads or styles. */
const ELEMENTS = new Set(
  "math mrow mi mn mo ms mtext mspace msub msup msubsup munder mover munderover mfrac msqrt mroot mstyle mpadded mphantom menclose mtable mtr mtd mlabeledtr mmultiscripts mprescripts none".split(
    " ",
  ),
);
const ATTRIBUTES = new Set(
  "display mathvariant stretchy fence separator lspace rspace accent accentunder movablelimits linethickness columnalign rowalign notation largeop symmetric scriptlevel displaystyle width height depth".split(
    " ",
  ),
);

/**
 * A copy of the page's formula rebuilt from what MathML draws: known elements with known attributes, text kept, and
 * anything else (links, images, styles, HTML inside mtext, the TeX annotation) dropped, its text kept where it is shown.
 */
function copyOf(original: Element): Element {
  const copy = (from: Node, into: Element): void => {
    for (const child of from.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        into.append(child.textContent ?? "");
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const name = el.localName;
      if (name === "annotation" || name === "annotation-xml" || name === "style" || name === "script") continue;
      // `semantics` shows its first child only.
      if (name === "semantics") {
        if (el.firstElementChild) copy({ childNodes: [el.firstElementChild] } as unknown as Node, into);
        continue;
      }
      if (!ELEMENTS.has(name)) {
        copy(el, into);
        continue;
      }
      const out = document.createElementNS(MATHML, name);
      for (const a of el.attributes) if (ATTRIBUTES.has(a.name)) out.setAttribute(a.name, a.value);
      copy(el, out);
      into.append(out);
    }
  };
  const root = document.createElementNS(MATHML, "math");
  for (const a of original.attributes) if (ATTRIBUTES.has(a.name)) root.setAttribute(a.name, a.value);
  copy(original, root);
  return root;
}

/**
 * Where a symbol is in the formula: each element that is that symbol, but not a part of a scripted symbol: neither the K
 * of K^T nor the K of W_i^K.
 */
function placesOf(formula: Element, symbol: string): Element[] {
  if (formula.localName !== "math" && !formula.querySelector("math")) return [];
  const key = texKey(symbol);
  return [...formula.querySelectorAll("mi, mo, mn, msub, msup, msubsup, munder, mover, munderover")].filter((el) => {
    const parent = el.parentElement;
    if (parent && SCRIPTED.has(parent.localName)) return false;
    return texKey(texOfMathml(el)) === key;
  });
}

export function formulaBlock(view: FormulaView): HTMLElement {
  const box = h("div", { className: "hb-formula", "data-hb": "formula", "data-tex": view.tex, dir: "ltr" });
  box.append(view.original ? copyOf(view.original) : renderMath(view.tex, true));
  return box;
}

function symbolRow(lang: Lang, s: FormulaSymbol, formula: HTMLElement, view: FormulaView): HTMLElement {
  const detail = h("div", { className: "hb-sym-detail", hidden: true });
  if (s.quote) {
    const quote = s.quote;
    detail.append(h("q", { "data-hb": "symbol-quote", dir: "auto" }, quote));
    if (view.showOnPage) {
      detail.append(
        " ",
        h(
          "button",
          { type: "button", className: "hb-link", "data-hb": "show-evidence", onclick: () => view.showOnPage?.(quote) },
          t(lang, "showEvidence"),
        ),
      );
    }
  }
  // The label is always shown; the quote only while the row is pointed at.
  const row = h(
    "div",
    { className: "hb-sym", "data-hb": "symbol", "data-tex": s.tex, tabindex: "0" },
    h("span", { className: "hb-sym-tex", dir: "ltr" }, renderMath(s.tex, false)),
    h("span", { className: "hb-sym-meaning", dir: "auto" }, s.meaning),
    h("span", { className: `hb-sym-source hb-src-${s.source}` }, t(lang, SOURCE_LABEL[s.source])),
    detail,
  );
  const places = placesOf(formula, s.tex);
  const on = () => {
    for (const other of formula.querySelectorAll(".hb-hl")) other.classList.remove("hb-hl");
    for (const p of places) p.classList.add("hb-hl");
    row.classList.add("hb-on");
    detail.hidden = detail.childElementCount === 0;
  };
  const off = () => {
    for (const p of places) p.classList.remove("hb-hl");
    row.classList.remove("hb-on");
    detail.hidden = true;
  };
  row.addEventListener("mouseenter", on);
  row.addEventListener("focus", on);
  row.addEventListener("mouseleave", off);
  row.addEventListener("blur", (e) => {
    // Moving to the row's own Show on page button keeps it open.
    if (!row.contains((e as FocusEvent).relatedTarget as Node | null)) off();
  });
  return row;
}

/** The body of a formula's card: the formula, what it says, a row per symbol and, when asked, how to read it aloud. */
export function formulaBody(lang: Lang, view: FormulaView, result: FormulaResult): { body: HTMLElement[]; aloud: (() => void) | null } {
  const formula = formulaBlock(view);
  const rows = h("div", { className: "hb-syms", "data-hb": "symbols" }, ...result.symbols.map((s) => symbolRow(lang, s, formula, view)));
  const gist = h(
    "p",
    { className: "hb-gist", "data-hb": "formula-gist", dir: "auto" },
    view.symbol ? "" : h("b", {}, `${t(lang, "formulaWhat")}: `),
    result.gist,
  );
  const body: HTMLElement[] = [formula];
  if (view.note === "pdf_text") body.push(h("div", { className: "hb-warn", "data-hb": "formula-warning" }, t(lang, "formulaFromPdf")));
  body.push(gist, rows);
  // Offered only when the model said how to read the formula.
  const aloud = !result.aloud
    ? null
    : () => {
        if (rows.parentElement?.querySelector('[data-hb="formula-aloud"]')) return;
        rows.after(h("p", { className: "hb-aloud", "data-hb": "formula-aloud", dir: "auto" }, result.aloud));
      };
  return { body, aloud };
}
