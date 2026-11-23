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

  it("shows a symbol and its meaning, without saying where the meaning comes from", () => {
    const { row } = setup();
    for (const tex of ["Q", "\\mathrm{softmax}", "Z"]) {
      expect(row(tex).querySelector(".hb-sym-meaning")!.textContent).not.toBe("");
      expect(row(tex).textContent).not.toMatch(/defined on this page|standard notation/i);
    }
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
  const res: FormulaResult = { gist: "g", symbols: [{ tex: "K", meaning: "keys", source: "standard", quote: null }] };

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

describe("while a formula's symbols are still being written", () => {
  const pending = (card: ExplainCard) => card.el.querySelector('[data-hb="symbols-pending"]');

  it("says so under the gist until the rows arrive", () => {
    const card = new ExplainCard("en", {} as ExplainCardHandlers);
    card.setFormulaStreaming("");
    expect(pending(card)).toBeNull();
    card.setFormulaStreaming("Each query is compared");
    card.setFormulaStreaming("Each query is compared with every key.");
    expect(card.el.querySelectorAll('[data-hb="symbols-pending"]')).toHaveLength(1);
    expect(pending(card)!.textContent).toBe("Explaining each symbol…");
    card.setFormula({ tex: TEX }, result);
    expect(pending(card)).toBeNull();
  });

  it("stops saying so on an error", () => {
    const card = new ExplainCard("en", { onRetry: vi.fn() } as unknown as ExplainCardHandlers);
    card.setFormulaStreaming("Each query is compared");
    card.error("network");
    expect(pending(card)).toBeNull();
  });
});

describe("math written in a formula's explanation", () => {
  it("is drawn as math in the gist and in a symbol's meaning", () => {
    const card = new ExplainCard("en", {} as ExplainCardHandlers);
    card.setFormula(
      { tex: TEX },
      {
        gist: String.raw`Scores are scaled by the square root of \(d_{k}\), and $5 costs stay text.`,
        symbols: [{ tex: "Q", meaning: String.raw`queries, one row per position $i$`, source: "standard", quote: null }],
      },
    );
    const gist = card.el.querySelector('[data-hb="formula-gist"]')!;
    expect(gist.textContent).not.toContain(String.raw`\(`);
    expect(gist.querySelector(".hb-math")!.getAttribute("data-tex")).toBe("d_{k}");
    expect(gist.textContent).toContain("$5 costs stay text");
    const meaning = card.el.querySelector(".hb-sym-meaning")!;
    expect(meaning.querySelector(".hb-math")!.getAttribute("data-tex")).toBe("i");
    expect(meaning.textContent).not.toContain("$");
  });
});
