// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { buildDigest, weekOf } from "../src/lib/digest";
import { comparisonText, digestView, rangeText } from "../src/lib/pages/digest-view";
import { world } from "./helpers";

const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).getTime();

function view(lang: "en" | "zh" = "en", offset = 0) {
  const w = world(at(10, 6));
  w.source("s1", "normal", "Paper One");
  const lora = w.concept("LoRA");
  w.encounter(lora, "s1");
  const goto = vi.fn();
  const digest = buildDigest(w.state(), weekOf(at(10, 7), offset));
  const el = digestView({ digest, lang, conceptHref: (id) => `#concept=${id}`, isCurrentWeek: offset === 0, goto });
  return { el, goto, lora };
}

describe("digestView", () => {
  it("shows the week, the counts, and links each term to its page", () => {
    const { el, lora } = view();
    expect(el.querySelector('[data-hb="digest-range"]')!.textContent).toBe("Oct 5 – Oct 11");
    const link = el.querySelector<HTMLAnchorElement>('[data-hb="digest-met"] a')!;
    expect(link.textContent).toBe("LoRA");
    expect(link.getAttribute("href")).toBe(`#concept=${lora}`);
    expect(el.textContent).toContain("Terms met");
    expect(el.textContent).toContain("no model is called");
    expect(el.querySelector('[data-hb="digest-sources"]')!.textContent).toContain("Paper One");
  });

  it("moves between weeks, and cannot go past this one", () => {
    const { el, goto } = view();
    el.querySelector<HTMLButtonElement>('[data-hb="digest-prev"]')!.click();
    expect(goto).toHaveBeenCalledWith(-1);
    expect(el.querySelector<HTMLButtonElement>('[data-hb="digest-next"]')!.disabled).toBe(true);
    const earlier = view("en", -1);
    expect(earlier.el.querySelector<HTMLButtonElement>('[data-hb="digest-next"]')!.disabled).toBe(false);
  });

  it("says so when a week has nothing in it", () => {
    const { el } = view("en", -2);
    expect(el.querySelector('[data-hb="digest-empty"]')!.textContent).toBe("Nothing was recorded this week.");
    expect(el.querySelector('[data-hb="digest-met"]')).toBeNull();
  });

  it("is written in the chosen language", () => {
    expect(view("zh").el.textContent).toContain("遇到的术语");
  });
});

describe("digest wording", () => {
  it("compares with the week before", () => {
    expect(comparisonText(5, 5, "en")).toBe("Same as the week before");
    expect(comparisonText(7, 5, "en")).toBe("2 more than the week before");
    expect(comparisonText(3, 5, "en")).toBe("2 fewer than the week before");
  });

  it("shows the last day of a week as Sunday", () => {
    expect(rangeText(weekOf(at(10, 7)), "en")).toBe("Oct 5 – Oct 11");
  });
});
