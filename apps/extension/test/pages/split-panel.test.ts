// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { conceptDetail } from "../../src/lib/records/concept-detail";
import { splitPanel } from "../../src/lib/pages/split-panel";
import { world } from "../helpers";

function setup(reply: unknown = { ok: true, conceptId: "NEW" }) {
  const w = world();
  w.source("s1", "normal", "Paper One");
  const c = w.concept("Prefix tuning", ["Prompt tuning"]);
  w.encounter(c, "s1");
  const second = w.encounter(c, "s1");
  const detail = conceptDetail(w.state(), c)!;
  const split = vi.fn(async () => reply as never);
  const done = vi.fn();
  const el = splitPanel({ detail, lang: "en", split, done });
  const tick = (sel: string, i: number) => {
    const box = el.querySelectorAll<HTMLInputElement>(`[data-hb="${sel}"]`)[i]!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
  };
  return { el, split, done, tick, c, second };
}

describe("splitPanel", () => {
  it("offers every look-up and every name except the concept's own", () => {
    const { el } = setup();
    expect(el.querySelectorAll('[data-hb="split-entry"]')).toHaveLength(2);
    expect([...el.querySelectorAll('[data-hb="split-alias"]')].map((b) => b.parentElement!.textContent)).toEqual(["Prompt tuning"]);
    expect(el.querySelector<HTMLButtonElement>('[data-hb="split-submit"]')!.disabled).toBe(true);
  });

  it("names the new concept after what was picked, and sends the split", async () => {
    const { el, split, done, tick, c } = setup();
    tick("split-alias", 0);
    tick("split-entry", 0);
    const name = el.querySelector<HTMLInputElement>('[data-hb="split-name"]')!;
    expect(name.value).toBe("Prompt tuning");
    el.querySelector<HTMLButtonElement>('[data-hb="split-submit"]')!.click();
    await vi.waitFor(() => expect(done).toHaveBeenCalledWith("NEW"));
    expect(split).toHaveBeenCalledWith(
      expect.objectContaining({ type: "split-concept", conceptId: c, names: ["Prompt tuning"], newName: "Prompt tuning" }),
    );
  });

  it("explains a refusal when the two would join again", async () => {
    const { el, done, tick } = setup({ ok: false, rejoins: true });
    tick("split-entry", 1);
    el.querySelector<HTMLButtonElement>('[data-hb="split-submit"]')!.click();
    await vi.waitFor(() => expect(el.querySelector('[data-hb="split-status"]')!.textContent).toContain("share a name"));
    expect(done).not.toHaveBeenCalled();
  });
});
