// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractPage } from "../../src/lib/source/extract";
import { definitionsFor, formulaSelection, symbolsOf, texOfMathml } from "../../src/lib/source/formula";

const parsed = new DOMParser().parseFromString(readFileSync("apps/extension/fixtures/arxiv-1706.03762.html", "utf8"), "text/html");
document.documentElement.remove();
document.appendChild(document.importNode(parsed.documentElement, true));
const page = extractPage(document, "https://arxiv.org/html/1706.03762");
const $ = (sel: string) => document.querySelector(sel)!;

const ATTENTION = "\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}(\\frac{QK^{T}}{\\sqrt{d_{k}}})V";

function textNodes(el: Node): Text[] {
  const out: Text[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n as Text);
  return out;
}
/** A range from the first text of `from` to the end of the last text of `to`. */
function span(from: Element, to: Element = from): Range {
  const a = textNodes(from)[0]!;
  const z = textNodes(to).at(-1)!;
  const r = document.createRange();
  r.setStart(a, 0);
  r.setEnd(z, z.data.length);
  return r;
}

describe("formulaSelection", () => {
  it("reads a selection inside one formula as that formula, from its source", () => {
    const sel = formulaSelection(span($("#m-q"), $("#m-v")));
    expect(sel).toMatchObject({ tex: ATTENTION, number: "1" });
    expect(sel?.symbol).toBeUndefined();
    expect(sel?.element).toBe($("#m-attention"));
  });

  it("reads the whole display equation row as the formula", () => {
    expect(formulaSelection(span($("#S3\\.E1")))?.tex).toBe(ATTENTION);
  });

  it("reads one symbol with its subscript as a symbol of the formula", () => {
    const sel = formulaSelection(span($("#m-dk")));
    expect(sel).toMatchObject({ tex: ATTENTION, symbol: "d_{k}" });
  });

  it("reads the base letter of a subscripted symbol as the whole symbol", () => {
    expect(formulaSelection(span($("#m-dk").firstElementChild!))?.symbol).toBe("d_{k}");
  });

  it("keeps prose with inline math as a term", () => {
    expect(formulaSelection(span($("#p-before")))).toBeNull();
  });

  it("keeps a plain word as a term", () => {
    const r = document.createRange();
    const t = textNodes($("#p-where")).at(-1)!;
    r.setStart(t, 1);
    r.setEnd(t, 4);
    expect(formulaSelection(r)).toBeNull();
  });

  it("reads a formula that is the only math of its paragraph and most of the selection", () => {
    expect(formulaSelection(span($("#m-loss")))?.tex).toBe("L=-\\sum_{i}\\log p(x_{i})");
  });
});

describe("texOfMathml", () => {
  it("writes sub- and superscripts, fractions and roots", () => {
    expect(texOfMathml($("#m-dk"))).toBe("d_{k}");
    expect(texOfMathml($("#m-attention").querySelector("mfrac")!)).toBe("\\frac{QK^{T}}{\\sqrt{d_{k}}}");
  });

  it("writes Greek letters as commands and words as upright text", () => {
    const m = new DOMParser().parseFromString("<math><mrow><mi>σ</mi><mo>(</mo><mi>softmax</mi><mo>)</mo></mrow></math>", "text/html");
    expect(texOfMathml(m.querySelector("math")!)).toBe("\\sigma(\\mathrm{softmax})");
  });
});

describe("symbolsOf", () => {
  it("lists identifiers with their scripts, in order, without operators or words", () => {
    expect(symbolsOf("\\mathrm{softmax}(QK^T/\\sqrt{d_k})V")).toEqual(["Q", "K^T", "d_k", "V"]);
    expect(symbolsOf(ATTENTION)).toEqual(["Q", "K", "V", "K^{T}", "d_{k}"]);
    expect(symbolsOf("\\theta_{t+1}=\\theta_t-\\eta\\nabla L")).toEqual(["\\theta_{t+1}", "\\theta_t", "\\eta", "L"]);
  });
});

describe("definitionsFor", () => {
  const defs = definitionsFor(page, ATTENTION, $("#m-attention"));
  const texts = defs.map((d) => d.text);

  it("puts a defining sentence of the notation section first", () => {
    expect(texts[0]).toMatch(/^Let d_\{k\} denote the dimension of the queries and keys\./);
  });

  it("includes the where-sentence after the equation", () => {
    expect(texts.some((t) => t.startsWith("where Q, K and V are the matrices"))).toBe(true);
  });

  it("numbers the sentences and keeps them short", () => {
    expect(defs.map((d) => d.id)).toEqual(defs.map((_, i) => `d${i + 1}`));
    expect(texts.join("").length).toBeLessThanOrEqual(4000);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("does not match a letter inside a word", () => {
    expect(
      definitionsFor(page, "Q", $("#m-attention"))
        .map((d) => d.text)
        .some((t) => /^We propose/.test(t)),
    ).toBe(false);
  });
});

describe("formulaSelection on arXiv markup with the TeX annotation", () => {
  const html = `<p id="ann">The scores are scaled by <math alttext="\\sqrt{d_{k}}" display="inline"><semantics><msqrt><msub><mi>d</mi><mi>k</mi></msub></msqrt><annotation encoding="application/x-tex">\\sqrt{d_{k}}</annotation></semantics></math> each time.</p>`;

  it("counts only the math that is shown, so prose around a formula stays a term", () => {
    document.body.insertAdjacentHTML("beforeend", html);
    // "scaled by √d_k": the shown math is 2 of 10 characters; with the annotation it would be 14 of 22.
    const r = document.createRange();
    const before = $("#ann").firstChild as Text;
    r.setStart(before, before.data.indexOf("scaled"));
    r.setEndAfter($("#ann math"));
    expect(formulaSelection(r)).toBeNull();
    expect(formulaSelection(span($("#ann msqrt")))?.tex).toBe("\\sqrt{d_{k}}");
  });
});

describe("symbols as real arXiv pages write them", () => {
  const mathml = (inner: string) => new DOMParser().parseFromString(`<math>${inner}</math>`, "text/html").querySelector("math")!;

  it("writes bold letters as \\mathbf and LaTeX's phi as \\phi", () => {
    expect(texOfMathml(mathml("<mi>𝐖</mi>"))).toBe("\\mathbf{W}");
    expect(texOfMathml(mathml("<msub><mi>ϕ</mi><mrow><mi>q</mi><mo>,</mo><mi>p</mi></mrow></msub>"))).toBe("\\phi_{q,p}");
    expect(texOfMathml(mathml("<mi>𝑡</mi>"))).toBe("t");
  });

  it("lists styled and accented letters as symbols of their own", () => {
    expect(symbolsOf("\\mathbf{Y}=\\mathbf{X}\\mathbf{W}+s\\mathbf{X}\\mathbf{L}_{1}\\mathbf{L}_{2}")).toEqual([
      "\\mathbf{Y}",
      "\\mathbf{X}",
      "\\mathbf{W}",
      "s",
      "\\mathbf{L}_{1}",
      "\\mathbf{L}_{2}",
    ]);
    expect(symbolsOf("\\hat{r}_{\\theta}+\\bm{\\delta}_{F}")).toEqual(["\\hat{r}_{\\theta}", "\\bm{\\delta}_{F}"]);
  });

  it("reads a symbol under max as that symbol, not as the max", () => {
    document.body.innerHTML = `<p><math alttext="\\max_{\\pi_{\\theta}}r"><semantics><mrow><munder><mi>max</mi><msub id="pt"><mi>π</mi><mi>θ</mi></msub></munder><mi>r</mi></mrow></semantics></math></p>`;
    expect(formulaSelection(span(document.querySelector("#pt")!))?.symbol).toBe("\\pi_{\\theta}");
  });
});

describe("symbols next to operators and powers", () => {
  it("does not climb from a symbol into the operator it is written under (argmin_W)", () => {
    document.body.innerHTML = `<p><math alttext="\\text{argmin}_{W}\\,X"><semantics><mrow><msub><mtext>argmin</mtext><mi id="w">W</mi></msub><mi>X</mi></mrow></semantics></math></p>`;
    expect(formulaSelection(span(document.querySelector("#w")!))?.symbol).toBe("W");
  });

  it("leaves powers and inverses out of a symbol's name", () => {
    expect(symbolsOf("\\mathbf{H}_{F}^{-1}+x^{2}+K^{T}")).toEqual(["\\mathbf{H}_{F}", "x", "K^{T}"]);
  });
});

describe("letters LaTeXML runs together", () => {
  it("writes each letter of a bold run, and accents over a letter", () => {
    const m = (inner: string) => new DOMParser().parseFromString(`<math>${inner}</math>`, "text/html").querySelector("math")!;
    expect(texOfMathml(m("<mi>𝐖𝐗</mi>"))).toBe("\\mathbf{W}\\mathbf{X}");
    expect(texOfMathml(m('<mover accent="true"><mi>𝐖</mi><mo>^</mo></mover>'))).toBe("\\hat{\\mathbf{W}}");
  });

  it("reads one selected letter of a run as that letter's symbol", () => {
    document.body.innerHTML = `<p><math alttext="\\mathbf{W}\\mathbf{X}-Y"><semantics><mrow><mi id="wx">𝐖𝐗</mi><mo>−</mo><mi>Y</mi></mrow></semantics></math></p>`;
    const text = document.querySelector("#wx")!.firstChild as Text;
    const r = document.createRange();
    r.setStart(text, 0);
    r.setEnd(text, 2);
    expect(formulaSelection(r)?.symbol).toBe("\\mathbf{W}");
  });
});

describe("the number of an equation group", () => {
  it("is read from the group's tag", () => {
    document.body.innerHTML = `<table class="ltx_equationgroup"><tbody><tr><td><math id="g" alttext="a=b"><semantics><mrow><mi>a</mi><mo>=</mo><mi>b</mi></mrow></semantics></math></td><td rowspan="2"><span class="ltx_tag ltx_tag_equationgroup">(4)</span></td></tr></tbody></table>`;
    expect(formulaSelection(span(document.querySelector("#g")!))?.number).toBe("4");
  });
});

describe("review: symbols with powers, Greek variants, styled alphabets, aligned rows", () => {
  const m = (inner: string) => new DOMParser().parseFromString(`<math>${inner}</math>`, "text/html").querySelector("math")!;

  it("reads a symbol with an inverse as the symbol", () => {
    document.body.innerHTML = `<p><math alttext="\\mathbf{H}^{-1}_{-q}=A"><semantics><mrow><msubsup id="h"><mi>𝐇</mi><mrow><mo>−</mo><mi>q</mi></mrow><mrow><mo>−</mo><mn>1</mn></mrow></msubsup><mo>=</mo><mi>A</mi></mrow></semantics></math></p>`;
    expect(formulaSelection(span(document.querySelector("#h")!))?.symbol).toBe("\\mathbf{H}_{-q}");
  });

  it("keeps LaTeX's phi and epsilon in bold and italic Greek", () => {
    expect(texOfMathml(m("<mi>𝝓</mi>"))).toBe("\\bm{\\phi}");
    expect(texOfMathml(m("<mi>𝝐</mi>"))).toBe("\\bm{\\epsilon}");
    expect(texOfMathml(m("<mi>𝜑</mi>"))).toBe("\\varphi");
  });

  it("writes calligraphic, blackboard and fraktur letters with their command", () => {
    expect(texOfMathml(m("<mi>𝒟</mi>"))).toBe("\\mathcal{D}");
    expect(texOfMathml(m("<mi>ℒ</mi>"))).toBe("\\mathcal{L}");
    expect(texOfMathml(m("<mi>𝔻</mi>"))).toBe("\\mathbb{D}");
    expect(texOfMathml(m("<mi>ℝ</mi>"))).toBe("\\mathbb{R}");
    expect(texOfMathml(m("<mi>𝔤</mi>"))).toBe("\\mathfrak{g}");
  });

  it("reads a whole aligned row, several cells, as one formula", () => {
    document.body.innerHTML = `<table class="ltx_equationgroup"><tbody><tr id="row"><td><math alttext="\\displaystyle p(x)"><semantics><mrow><mi>p</mi><mo>(</mo><mi>x</mi><mo>)</mo></mrow></semantics></math></td><td><math alttext="\\displaystyle=\\frac{a}{b}"><semantics><mrow><mo>=</mo><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow></semantics></math></td><td><span class="ltx_tag ltx_tag_equation">(5)</span></td></tr></tbody></table>`;
    expect(formulaSelection(span(document.querySelector("#row")!))).toMatchObject({ tex: "p(x)=\\frac{a}{b}", number: "5" });
  });
});

describe("audit: cells of aligned rows, display style, the letter a", () => {
  it("reads a symbol in one cell of an aligned row against the whole row", () => {
    document.body.innerHTML = `<table class="ltx_equationgroup"><tbody><tr><td><math alttext="\\displaystyle p(x)"><semantics><mrow><mi>p</mi><mo>(</mo><mi>x</mi><mo>)</mo></mrow></semantics></math></td><td><math alttext="\\displaystyle=\\frac{a}{b}"><semantics><mrow><mo>=</mo><mfrac><mi id="b">b</mi><mi>c</mi></mfrac></mrow></semantics></math></td></tr></tbody></table>`;
    expect(formulaSelection(span(document.querySelector("#b")!))).toMatchObject({ tex: "p(x)=\\frac{a}{b}", symbol: "b" });
  });

  it("leaves \\displaystyle out of a formula", () => {
    document.body.innerHTML = `<p>x <math id="d" alttext="{\\displaystyle d_{k}}"><semantics><msub><mi>d</mi><mi>k</mi></msub></semantics></math> y</p>`;
    const r = document.createRange();
    r.selectNodeContents(document.querySelector("#d")!);
    expect(formulaSelection(r)).toMatchObject({ tex: "{d_{k}}", symbol: "{d_{k}}" });
  });

  it("does not take the article a for the symbol a", () => {
    document.body.innerHTML = `<div class="ltx_page_content"><section><h2>2 Notation</h2><p>Let a denote the step size. We use a linear layer for this.</p><p>The update is <math id="f" alttext="x=a+b"><semantics><mrow><mi>x</mi><mo>=</mo><mi>a</mi><mo>+</mo><mi>b</mi></mrow></semantics></math>.</p></section></div>`;
    const page = extractPage(document, "https://arxiv.org/html/0000.00000");
    const defs = definitionsFor(page, "x=a+b", document.querySelector("#f")!).map((d) => d.text);
    expect(defs).toContain("Let a denote the step size.");
    expect(defs).not.toContain("We use a linear layer for this.");
  });
});
