// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/lib/ui/markdown";

const render = (src: string) => {
  const div = document.createElement("div");
  div.append(renderMarkdown(src));
  return div;
};

describe("renderMarkdown", () => {
  it("renders paragraphs, emphasis, code, lists, code blocks and formulas", () => {
    const div = render(
      "First **bold** and *em* with `code` and $x^2$.\nSame paragraph.\n\n- one\n- two\n\n1. first\n\n```\nconst a = 1;\n```\n\n$$E = mc^2$$",
    );
    expect(div.querySelectorAll("p")).toHaveLength(1);
    expect(div.querySelector("p")!.textContent).toBe("First bold and em with code and x2. Same paragraph.");
    expect(div.querySelector("strong")!.textContent).toBe("bold");
    expect(div.querySelector("em")!.textContent).toBe("em");
    expect(div.querySelector("span.hb-math sup")!.textContent).toBe("2");
    expect([...div.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["one", "two"]);
    expect(div.querySelector("ol li")!.textContent).toBe("first");
    expect(div.querySelector("pre code")!.textContent).toBe("const a = 1;");
    expect(div.querySelector(".hb-math-block")!.textContent).toBe("E=mc2");
  });

  it("typesets \\( \\) and \\[ \\] formulas instead of showing the TeX or turning _ and * into emphasis", () => {
    const div = render(
      "Use \\(\\exp(\\sum_{n} w_n \\log p_n)\\) where \\(p_n\\) is the precision and \\(\\alpha * \\beta\\).\n\n\\[ \\frac{a}{b} \\leq \\sqrt{x} \\]",
    );
    expect(div.querySelector("em")).toBeNull();
    expect(div.querySelector("p")!.textContent).toContain("exp(∑nwnlogpn)");
    expect(div.querySelector("p")!.textContent).not.toContain("\\");
    expect(div.querySelectorAll("p sub").length).toBeGreaterThan(1);
    expect(div.querySelector(".hb-math-block .hb-frac .hb-num")!.textContent).toBe("a");
    expect(div.querySelector(".hb-math-block")!.textContent).toContain("≤");
  });

  it("never creates HTML from the text", () => {
    const div = render('<img src=x onerror="alert(1)"><script>alert(1)</script> ![pic](https://example.com/p.png)');
    expect(div.querySelector("img, script, a")).toBeNull();
    expect(div.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(div.textContent).toContain("pic");
  });

  it("keeps balanced parentheses inside a link address", () => {
    const div = render("[Python](https://en.wikipedia.org/wiki/Python_(programming_language)) is common");
    const link = div.querySelector(".hb-link")!;
    expect(link.getAttribute("data-url")).toBe("https://en.wikipedia.org/wiki/Python_(programming_language)");
    expect(div.textContent).toBe("Python is common");
  });

  it("turns only http(s) links into inert link spans", () => {
    const div = render("[LoRA](https://arxiv.org/abs/2106.09685) and [bad](javascript:alert(1))");
    const links = div.querySelectorAll(".hb-link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("data-url")).toBe("https://arxiv.org/abs/2106.09685");
    expect(links[0]!.textContent).toBe("LoRA");
    expect(div.textContent).toContain("bad");
    expect(div.querySelector("a")).toBeNull();
  });

  it("renders headings as bold paragraphs", () => {
    expect(render("## Title\ntext").querySelector("p strong")!.textContent).toBe("Title");
  });
});

describe("renderMarkdown edge cases", () => {
  it("keeps snake_case identifiers and prices as text", () => {
    const div = render("Set max_tokens and min_tokens. It costs $5 per run, or $10 for two. Use __init__ and _emphasis_ too.");
    expect(div.querySelector(".hb-math")).toBeNull();
    const p = div.querySelector("p")!;
    expect(p.textContent).toContain("max_tokens and min_tokens");
    expect(p.textContent).toContain("$5 per run, or $10");
    expect(div.querySelector("em")!.textContent).toBe("emphasis");
  });

  it("still typesets a formula next to a price", () => {
    expect(render("Take $x^2$ then pay $5.").querySelector(".hb-math")).not.toBeNull();
  });

  it("nests lists by indentation", () => {
    const div = render("- one\n  - inner a\n  - inner b\n- two\n\n1. first\n   - sub");
    expect(div.querySelectorAll("ul > li > ul > li")).toHaveLength(2);
    expect(div.querySelector("ul")!.children).toHaveLength(2);
    expect(div.querySelector("ol > li > ul > li")!.textContent).toBe("sub");
  });

  it("renders tables", () => {
    const div = render("Before\n\n| Model | Params |\n| --- | ---: |\n| A | 7B |\n| B | 13B |\n\nAfter");
    expect([...div.querySelectorAll("th")].map((c) => c.textContent)).toEqual(["Model", "Params"]);
    expect([...div.querySelectorAll("tbody tr")].map((r) => r.textContent)).toEqual(["A7B", "B13B"]);
    expect(div.querySelectorAll("p")).toHaveLength(2);
  });
});
