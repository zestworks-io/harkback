// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { commonsView, contributablePapers } from "../../src/lib/pages/commons-view";
import { world } from "../helpers";

function setup() {
  const w = world();
  const open = (id: string, title: string) =>
    w.events.push(
      w.f.make("source.seen", { source_id: id, ids: { arxiv: id.slice(6) }, title, license: "cc-by-4.0", sensitivity: "normal" }),
    );
  open("arxiv:2106.09685", "LoRA paper");
  open("arxiv:2305.14314", "QLoRA paper");
  w.source("url:https://blog.example/", "normal", "A blog");
  const lora = w.concept("LoRA");
  w.encounter(lora, "arxiv:2106.09685");
  const qlora = w.concept("QLoRA");
  w.encounter(qlora, "arxiv:2305.14314");
  w.encounter(lora, "url:https://blog.example/");
  return w;
}

describe("commonsView", () => {
  it("lists the papers that may be contributed and shows every line of the file", () => {
    const save = vi.fn();
    const el = commonsView({ state: setup().state(), lang: "en", alsoSensitive: () => false, paper: null, onPick: vi.fn(), save });
    const options = [...el.querySelectorAll('[data-hb="commons-scope"] option')].map((o) => o.textContent);
    expect(options).toEqual(["Every openly licensed paper", "LoRA paper", "QLoRA paper"]);
    const preview = JSON.parse(el.querySelector('[data-hb="commons-preview"]')!.textContent!);
    expect(preview.records.map((r: { paper: string }) => r.paper)).toEqual(["arxiv:2106.09685", "arxiv:2305.14314"]);
    expect(el.querySelector('[data-hb="commons-summary"]')!.textContent).toBe("Look-ups: 2 · Papers: 2 · Confirmed relations: 0");
    expect(el.textContent).not.toContain("blog.example");
  });

  it("narrows to one paper and saves what it shows, with the scope agreed to", () => {
    const save = vi.fn();
    const el = commonsView({ state: setup().state(), lang: "en", alsoSensitive: () => false, paper: null, onPick: vi.fn(), save });
    const select = el.querySelector<HTMLSelectElement>('[data-hb="commons-scope"]')!;
    select.value = "arxiv:2305.14314";
    select.dispatchEvent(new Event("change"));
    el.querySelector<HTMLButtonElement>('[data-hb="commons-save"]')!.click();
    expect(save).toHaveBeenCalledTimes(1);
    const [scope, contribution] = save.mock.calls[0]!;
    expect(scope).toEqual({ scope: "this_source", target: "arxiv:2305.14314" });
    expect(contribution.records.map((r: { term: string }) => r.term)).toEqual(["QLoRA"]);
  });

  it("says so when no paper can be contributed, including those a site rule makes sensitive", () => {
    const el = commonsView({ state: setup().state(), lang: "en", alsoSensitive: () => true, paper: null, onPick: vi.fn(), save: vi.fn() });
    expect(el.querySelector('[data-hb="commons-empty"]')).not.toBeNull();
    expect(contributablePapers(setup().state(), () => true)).toEqual([]);
  });

  it("keeps the paper picked when it is drawn again", () => {
    const onPick = vi.fn();
    const first = commonsView({ state: setup().state(), lang: "en", alsoSensitive: () => false, paper: null, onPick, save: vi.fn() });
    const select = first.querySelector<HTMLSelectElement>('[data-hb="commons-scope"]')!;
    select.value = "arxiv:2305.14314";
    select.dispatchEvent(new Event("change"));
    expect(onPick).toHaveBeenCalledWith("arxiv:2305.14314");
    const again = commonsView({
      state: setup().state(),
      lang: "en",
      alsoSensitive: () => false,
      paper: "arxiv:2305.14314",
      onPick,
      save: vi.fn(),
    });
    expect(again.querySelector<HTMLSelectElement>('[data-hb="commons-scope"]')!.value).toBe("arxiv:2305.14314");
    expect(JSON.parse(again.querySelector('[data-hb="commons-preview"]')!.textContent!).records).toHaveLength(1);
  });
});
