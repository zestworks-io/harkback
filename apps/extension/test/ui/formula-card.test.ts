// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import type { FormulaResult } from "@harkback/core";
import { describe, expect, it, vi } from "vitest";
import { ExplainCard, type ExplainCardHandlers, type FormulaView } from "../../src/lib/ui/explain-card";

const fixture = new DOMParser().parseFromString(readFileSync("apps/extension/fixtures/arxiv-1706.03762.html", "utf8"), "text/html");
const math = fixture.querySelector("#m-attention")!;
const TEX = math.getAttribute("alttext")!;

const result: FormulaResult = {
  gist: "Each query is compared with every key and the values are averaged.",
  aloud: "Attention of Q, K, V equals softmax of Q K transpose over root d k, times V.",
  symbols: [
    { tex: "Q", meaning: "queries", source: "page", quote: "Q, K and V are the matrices of queries, keys and values" },
    { tex: "K", meaning: "keys", source: "page", quote: "Q, K and V are the matrices of queries, keys and values" },
    { tex: "d_{k}", meaning: "dimension of the keys", source: "page", quote: "Let d_{k} denote the dimension of the queries and keys" },
    { tex: "\\mathrm{softmax}", meaning: "turns scores into weights", source: "standard", quote: null },
    { tex: "Z", meaning: "not in the formula", source: "none", quote: null },
  ],
};

function setup(view: Partial<FormulaView> = {}) {
  const handlers: ExplainCardHandlers = {
    onAnswer: vi.fn(),
    onAction: vi.fn(),
    onFollowUp: vi.fn(),
    onMarkSensitive: vi.fn(),
    onChoose: vi.fn(),
    onRetry: vi.fn(),
    onRetryWith: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    onReexplain: vi.fn(),
  };
  const card = new ExplainCard("en", handlers);
  document.body.replaceChildren(card.el);
  const showOnPage = vi.fn();
  card.setFormula({ tex: TEX, original: math, showOnPage, ...view }, result);
  card.formulaDone(false);
  const q = (hb: string) => card.el.querySelector<HTMLElement>(`[data-hb="${hb}"]`);
  const row = (tex: string) => [...card.el.querySelectorAll<HTMLElement>('[data-hb="symbol"]')].find((r) => r.dataset.tex === tex)!;
  return { card, handlers, q, row, showOnPage };
}

describe("ExplainCard for a formula", () => {
  it("shows the gist, a row per symbol and the formula's buttons, and nothing about recording", () => {
    const { q, card } = setup();
    expect(q("formula-gist")!.textContent).toContain("Each query is compared");
    expect(card.el.querySelectorAll('[data-hb="symbol"]')).toHaveLength(5);
    expect(q("formula-aloud-open")).not.toBeNull();
    expect(q("followup-open")).not.toBeNull();
    expect(q("reexplain")).not.toBeNull();
    expect(q("understood")).toBeNull();
    expect(q("confused")).toBeNull();
    expect(q("mark-sensitive")).toBeNull();
    expect(q("note")!.textContent).toBe("Formula explanations are not saved.");
  });

  it("highlights every place of a symbol in the formula while its row is pointed at, and shows its quote", () => {
    const { row, card } = setup();
    row("Q").dispatchEvent(new Event("mouseenter"));
    const lit = [...card.el.querySelectorAll(".hb-hl")];
    expect(lit.map((e) => e.textContent)).toEqual(["Q", "Q"]);
    expect(row("Q").querySelector('[data-hb="symbol-quote"]')!.textContent).toContain("matrices of queries");
    row("Q").dispatchEvent(new Event("mouseleave"));
    expect(card.el.querySelectorAll(".hb-hl")).toHaveLength(0);
  });

  it("highlights a symbol with its subscript, and not the base of another symbol", () => {
    const { row, card } = setup();
    row("d_{k}").dispatchEvent(new Event("focus"));
    expect([...card.el.querySelectorAll(".hb-hl")].map((e) => e.localName)).toEqual(["msub"]);
    row("K").dispatchEvent(new Event("focus"));
    // K alone, not the K of K^T.
    expect(card.el.querySelectorAll(".hb-hl")).toHaveLength(1);
  });

  it("highlights nothing for a symbol it cannot find in the formula", () => {
    const { row, card } = setup();
    row("Z").dispatchEvent(new Event("mouseenter"));
    expect(card.el.querySelectorAll(".hb-hl")).toHaveLength(0);
  });

  it("labels where each meaning comes from", () => {
    const { row } = setup();
    expect(row("Q").textContent).toContain("Defined on this page");
    expect(row("\\mathrm{softmax}").textContent).toContain("Standard notation");
    expect(row("Z").textContent).toContain("Not defined on this page");
  });

  it("shows the quote on the page when asked, and only offers that when the page has it", () => {
    const { row, showOnPage } = setup();
    row("d_{k}").dispatchEvent(new Event("mouseenter"));
    row("d_{k}").querySelector<HTMLElement>('[data-hb="show-evidence"]')!.click();
    expect(showOnPage).toHaveBeenCalledWith("Let d_{k} denote the dimension of the queries and keys");
    const other = setup({ showOnPage: undefined });
    other.row("Q").dispatchEvent(new Event("mouseenter"));
    expect(other.row("Q").querySelector('[data-hb="symbol-quote"]')).not.toBeNull();
    expect(other.row("Q").querySelector('[data-hb="show-evidence"]')).toBeNull();
  });

  it("says when the formula was read from a PDF", () => {
    const { q } = setup({ note: "pdf_text", original: undefined });
    expect(q("formula-warning")!.textContent).toBe("Read from the PDF; symbols may be inexact");
    expect(q("formula")!.querySelector("math")).toBeNull();
    expect(q("formula")!.getAttribute("data-tex")).toBe(TEX);
  });

  it("reveals how it is read aloud", () => {
    const { q } = setup();
    expect(q("formula-aloud")).toBeNull();
    q("formula-aloud-open")!.click();
    expect(q("formula-aloud")!.textContent).toContain("softmax of Q K transpose");
  });

  it("explains again, and offers the whole formula from a symbol card", () => {
    const onExplainWhole = vi.fn();
    const { q, handlers } = setup({ symbol: "d_{k}", onExplainWhole });
    q("reexplain")!.click();
    expect(handlers.onReexplain).toHaveBeenCalled();
    q("explain-whole")!.click();
    expect(onExplainWhole).toHaveBeenCalled();
    expect(setup().q("explain-whole")).toBeNull();
  });

  it("streams the gist before the result arrives", () => {
    const card = new ExplainCard("en", {} as ExplainCardHandlers);
    card.setFormulaStreaming("Each query");
    expect(card.el.querySelector('[data-hb="explanation"]')!.textContent).toBe("Each query");
  });
});

describe("ExplainCard: the copy of the page's formula", () => {
  const hostile = new DOMParser()
    .parseFromString(
      `<math alttext="W_{i}^{K}+K" style="position:fixed"><semantics><mrow><msubsup href="https://evil.example/"><mi>W</mi><mi>i</mi><mi>K</mi></msubsup><mo>+</mo><mi>K</mi><mtext><a href="https://evil.example/">cite</a><img src="https://evil.example/x.png"><style>*{display:none}</style></mtext></mrow><annotation encoding="application/x-tex">W_{i}^{K}+K</annotation></semantics></math>`,
      "text/html",
    )
    .querySelector("math")!;
  const res: FormulaResult = { gist: "g", aloud: "", symbols: [{ tex: "K", meaning: "keys", source: "standard", quote: null }] };

  function show() {
    const card = new ExplainCard("en", {} as ExplainCardHandlers);
    document.body.replaceChildren(card.el);
    card.setFormula({ tex: "W_{i}^{K}+K", original: hostile }, res);
    return card;
  }

  it("keeps only MathML and its harmless attributes", () => {
    const formula = show().el.querySelector('[data-hb="formula"]')!;
    expect(formula.querySelector("a, img, style, annotation")).toBeNull();
    expect(formula.querySelector("[href], [style], [src]")).toBeNull();
    expect(formula.textContent).toContain("cite");
  });

  it("does not light up the script of another symbol", () => {
    const card = show();
    card.el.querySelector<HTMLElement>('[data-hb="symbol"]')!.dispatchEvent(new Event("mouseenter"));
    const lit = [...card.el.querySelectorAll(".hb-hl")];
    expect(lit).toHaveLength(1);
    expect(lit[0]!.parentElement!.localName).toBe("mrow");
  });
});

describe("audit: read aloud", () => {
  it("is offered only when there is a spoken line", () => {
    const card = new ExplainCard("en", {} as ExplainCardHandlers);
    card.setFormula({ tex: TEX }, { ...result, aloud: "" });
    card.formulaDone(false);
    expect(card.el.querySelector('[data-hb="formula-aloud-open"]')).toBeNull();
  });
});
