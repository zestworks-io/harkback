// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { equationNumber, looksLikeMath, matchEquation, parseArxivHtml } from "../../src/lib/pdf/formula-match";

const URL = "https://arxiv.org/html/1706.03762";
const html = parseArxivHtml(readFileSync("apps/extension/fixtures/arxiv-1706.03762.html", "utf8"), URL);
const ATTENTION = "\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}(\\frac{QK^{T}}{\\sqrt{d_{k}}})V";

const page = (body: string) =>
  parseArxivHtml(`<html><body><div class="ltx_page_content"><article class="ltx_document">${body}</article></div></body></html>`, URL);

describe("parseArxivHtml", () => {
  it("lists the formulas with their source and equation numbers", () => {
    const eq = html.equations.find((e) => e.tex === ATTENTION);
    expect(eq?.number).toBe("1");
    expect(html.equations.some((e) => e.tex === "L=-\\sum_{i}\\log p(x_{i})")).toBe(true);
    expect(html.page.text).toContain("Let d_{k} denote the dimension");
  });
});

describe("matchEquation", () => {
  it("takes the equation whose number is printed at the end of the line", () => {
    const line = "Attention(Q, K, V ) = softmax( QKT √dk )V (1)";
    expect(matchEquation("softmax( QKT √dk )V", line, html)?.tex).toBe(ATTENTION);
  });

  it("matches by the characters of the formula when there is no number", () => {
    const sel = "L = −∑ log p(xi)";
    expect(matchEquation(sel, `The loss is ${sel} over the tokens.`, html)?.tex).toBe("L=-\\sum_{i}\\log p(x_{i})");
  });

  it("gives no match when two equations read the same", () => {
    const twin = page('<p><math alttext="a+b=c"></math></p><p><math alttext="a+b=c"></math></p>');
    expect(matchEquation("a + b = c", "a + b = c", twin)).toBeNull();
  });

  it("gives no match when nothing is close", () => {
    expect(matchEquation("∇θ J(θ) = E[R]", "∇θ J(θ) = E[R]", html)).toBeNull();
  });

  it("ignores an equation number the page does not have", () => {
    expect(matchEquation("x + y", "x + y (7)", html)).toBeNull();
  });
});

describe("looksLikeMath", () => {
  it("is true for a formula and for a line with an equation number", () => {
    expect(looksLikeMath("softmax(QKT/√dk)V", "softmax(QKT/√dk)V")).toBe(true);
    expect(looksLikeMath("Attention", "Attention(Q, K, V ) = softmax(QKT/√dk)V (1)")).toBe(true);
  });

  it("is false for prose, even with a letter that is a symbol", () => {
    expect(looksLikeMath("the rank r is small", "where the rank r is small and the update is cheap")).toBe(false);
    expect(looksLikeMath("attention", "We use attention in all layers.")).toBe(false);
  });
});

describe("PDF selections that are prose", () => {
  it("does not read acronyms, citations or hyphenated words as math", () => {
    for (const s of ["RNN", "the RNN", "et al.", "self-attention", "GPT-4"])
      expect(looksLikeMath(s, `We compare with the ${s} here.`), s).toBe(false);
  });

  it("does not take a year or a reference to an equation for an equation number", () => {
    expect(equationNumber("as introduced by Vaswani et al. (2017)")).toBeNull();
    expect(equationNumber("which follows from Eq. (1)")).toBeNull();
    expect(equationNumber("the weights we use (1)")).toBeNull();
    expect(equationNumber("Attention(Q, K, V ) = softmax(QKT/dk)V (1)")).toBe("1");
    expect(looksLikeMath("self-attention", "self-attention as in Eq. (1)")).toBe(false);
    expect(matchEquation("self-attention", "self-attention as in Eq. (1)", html)).toBeNull();
  });
});

describe("looksLikeMath on a real PDF selection", () => {
  it("counts function names written right before a bracket as part of the formula", () => {
    expect(looksLikeMath("Attention(Q, K, V ) = softmax( QKT√dk)V", "Attention( Q, K, V ) = softmax( √ ) V")).toBe(true);
    expect(looksLikeMath("we use attention (see Section 2)", "we use attention (see Section 2) here")).toBe(false);
  });
});

describe("parseArxivHtml on equation groups", () => {
  const group = page(`<table class="ltx_equationgroup"><tbody>
    <tr class="ltx_equation ltx_eqn_row"><td><math alttext="\\displaystyle p^{*}(y_{1}\\succ y_{2}|x)"></math></td><td><math alttext="\\displaystyle=\\frac{a}{b}"></math></td><td><span class="ltx_tag ltx_tag_equation">(12)</span></td></tr>
    <tr class="ltx_equation ltx_eqn_row"><td><math alttext="\\displaystyle q(z)"></math></td><td><math alttext="\\displaystyle=c+d"></math></td><td><span class="ltx_tag ltx_tag_equation">(13)</span></td></tr>
  </tbody></table>`);

  it("reads each row as one equation with the row's own number", () => {
    expect(group.equations.map((e) => [e.number, e.tex])).toEqual([
      ["12", "p^{*}(y_{1}\\succ y_{2}|x)=\\frac{a}{b}"],
      ["13", "q(z)=c+d"],
    ]);
  });
});

describe("matching PDF text that has no equation number", () => {
  it("gives no match for a short fragment that several equations share", () => {
    const two = page(
      '<p><math alttext="p(\\tau|y_{1},\\ldots,y_{K},x)=\\prod_{k}a_{k}"></math></p><p><math alttext="=p_{r}(\\tau|y_{1},\\ldots,y_{K},x),"></math></p>',
    );
    expect(matchEquation("p ( τ | y 1 , . . . , y K , x ) = P", "p ( τ | y 1 , . . . , y K , x ) = P", two)).toBeNull();
  });
});

describe("continuation rows of an aligned equation", () => {
  it("joins an unnumbered row that starts with a relation to the row above", () => {
    const aligned = page(`<table id="G" class="ltx_equationgroup"><tbody>
      <tr><td><math alttext="\\displaystyle p_{r'}(\\tau|x)"></math></td><td><math alttext="\\displaystyle=\\prod_{k}a_{k}"></math></td></tr>
      <tr><td></td><td><math alttext="\\displaystyle=p_{r}(\\tau|x),"></math></td></tr>
      <tr><td><math alttext="\\displaystyle q"></math></td><td><math alttext="\\displaystyle=1"></math></td><td><span class="ltx_tag ltx_tag_equation">(3)</span></td></tr>
    </tbody></table>`);
    expect(aligned.equations.map((e) => [e.number ?? null, e.tex])).toEqual([
      [null, "p_{r'}(\\tau|x)=\\prod_{k}a_{k}=p_{r}(\\tau|x),"],
      ["3", "q=1"],
    ]);
  });
});

describe("an equation whose number sits in a row of its own", () => {
  it("gives the table's one number to its rows", () => {
    const numbered = page(`<table id="E23" class="ltx_equationgroup"><tbody>
      <tr><td><math alttext="\\texttt{a(0)}"></math></td></tr>
      <tr><td><span class="ltx_tag ltx_tag_equation">(2.23)</span></td></tr>
      <tr><td><math alttext="\\texttt{b(1)}"></math></td></tr>
    </tbody></table>`);
    expect(numbered.equations.map((e) => e.number)).toEqual(["2.23", "2.23"]);
  });
});

describe("an equation group's shared number", () => {
  it("reads the group tag in a cell spanning the rows as the number of each row", () => {
    const grouped = page(`<table id="S2.E23" class="ltx_equationgroup"><tbody>
      <tr><td><math alttext="\\texttt{a(0)}"></math></td><td rowspan="2"><span class="ltx_tag ltx_tag_equationgroup">(2.23)</span></td></tr>
      <tr><td><math alttext="\\texttt{b(1)}"></math></td></tr>
    </tbody></table>`);
    expect(grouped.equations.map((e) => e.number)).toEqual(["2.23", "2.23"]);
  });
});

describe("review: continuation rows", () => {
  it("does not take a row starting with \\left for a continuation", () => {
    const rows = page(`<table id="G" class="ltx_equationgroup"><tbody>
      <tr><td><math alttext="a=b"></math></td></tr>
      <tr><td><math alttext="\\left\\|x\\right\\|=1"></math></td></tr>
    </tbody></table>`);
    expect(rows.equations.map((e) => e.tex)).toEqual(["a=b", "\\left\\|x\\right\\|=1"]);
  });

  it("keeps a command apart from a letter when joining cells", () => {
    const rows = page(
      `<table id="H" class="ltx_equation"><tbody><tr><td><math alttext="\\displaystyle a\\cdot"></math></td><td><math alttext="\\displaystyle x"></math></td></tr></tbody></table>`,
    );
    expect(rows.equations[0]!.tex).toBe("a\\cdot x");
  });
});
