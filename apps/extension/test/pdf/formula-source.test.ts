// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { lineOf, pdfFormula } from "../../src/lib/pdf/formula-source";

describe("lineOf", () => {
  it("joins the spans drawn on the same line only, not the lines just above and below", () => {
    // pdf.js places spans in percent of the page: 12pt lines on a 792pt page are 1.5% apart.
    document.body.innerHTML = `<p class="markedContent">
      <span style="top: 10.00%">as in Eq. (1)</span>
      <span style="top: 11.52%">L = -sum log p(xi)</span>
      <span style="top: 11.52%">(2)</span>
      <span style="top: 13.04%">where p is a probability</span>
    </p>`;
    const spans = document.querySelectorAll("span");
    expect(lineOf(spans[1]!.firstChild!)).toBe("L = -sum log p(xi) (2)");
    expect(lineOf(spans[0]!.firstChild!)).toBe("as in Eq. (1)");
  });
});

describe("lineOf across paragraph blocks", () => {
  it("finds the equation number pdf.js put in another block of the same line", () => {
    document.body.innerHTML = `<div class="textLayer">
      <p class="markedContent"><span style="top: 40.10%">Attention(Q, K, V) = softmax(QKT/dk)V</span></p>
      <p class="markedContent"><span style="top: 40.10%">(1)</span></p>
      <p class="markedContent"><span style="top: 42.00%">where the next line starts</span></p>
    </div>`;
    expect(lineOf(document.querySelector("span")!.firstChild!)).toBe("Attention(Q, K, V) = softmax(QKT/dk)V (1)");
  });
});

describe("lineOf in a two-column page", () => {
  const rect = (el: Element, left: number, width: number, top: number) =>
    (el.getBoundingClientRect = () =>
      ({ left, right: left + width, width, top, bottom: top + 10, height: 10, x: left, y: top, toJSON: () => ({}) }) as DOMRect);

  it("keeps to the selection's column when nothing on the line crosses the middle of the page", () => {
    document.body.innerHTML = `<div class="textLayer"><p class="markedContent"><span>the transformer layer</span></p><p class="markedContent"><span>Attention = softmax(QK)V</span><span>(1)</span></p></div>`;
    const layer = document.querySelector(".textLayer")!;
    rect(layer, 0, 600, 0);
    const [prose, eq, num] = [...document.querySelectorAll("span")];
    rect(prose!, 40, 220, 100);
    rect(eq!, 340, 160, 100);
    rect(num!, 540, 20, 100);
    expect(lineOf(prose!.firstChild!)).toBe("the transformer layer");
    expect(lineOf(eq!.firstChild!)).toBe("Attention = softmax(QK)V (1)");
  });

  it("keeps a single-column line whole", () => {
    document.body.innerHTML = `<div class="textLayer"><p class="markedContent"><span>Attention = softmax(QK)V</span></p><p class="markedContent"><span>(1)</span></p></div>`;
    rect(document.querySelector(".textLayer")!, 0, 600, 0);
    const [eq, num] = [...document.querySelectorAll("span")];
    rect(eq!, 200, 200, 100);
    rect(num!, 560, 20, 100);
    expect(lineOf(eq!.firstChild!)).toBe("Attention = softmax(QK)V (1)");
  });
});

describe("pdfFormula", () => {
  it("does not ask arXiv when the lookup is not allowed", async () => {
    document.body.innerHTML = `<div class="textLayer"><p class="markedContent"><span>L = -sum log p(xi) (1)</span></p></div>`;
    let asked = 0;
    const find = pdfFormula("1706.03762", async () => {
      asked++;
      return { kind: "none" };
    });
    const r = document.createRange();
    r.selectNodeContents(document.querySelector("span")!);
    const pick = await find(r, {} as never, async () => false);
    expect(asked).toBe(0);
    expect(pick?.request.approximate).toBe(true);
  });
});
