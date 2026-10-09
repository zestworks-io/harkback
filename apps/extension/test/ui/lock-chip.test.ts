// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { LockChip } from "../../src/lib/ui/lock-chip";

function setup() {
  const handlers = { onUnmark: vi.fn(), onChoose: vi.fn() };
  const chip = new LockChip("en", handlers);
  document.body.append(chip.el);
  const q = (hb: string) => chip.el.querySelector<HTMLElement>(`[data-hb="${hb}"]`);
  return { chip, handlers, q };
}

describe("LockChip", () => {
  it("is not there for a page that is fine", () => {
    const { chip } = setup();
    chip.set("normal");
    expect(chip.el.hidden).toBe(true);
  });

  it("shows that a page is sensitive and unmarks it when pressed", () => {
    const { chip, handlers, q } = setup();
    chip.set("sensitive");
    expect(chip.el.hidden).toBe(false);
    expect(q("lock")!.textContent).toContain("Sensitive");
    q("lock")!.click();
    expect(handlers.onUnmark).toHaveBeenCalledTimes(1);
  });

  it("asks how to handle a page that looks private, and answers once", () => {
    const { chip, handlers, q } = setup();
    chip.set("ask");
    expect(q("lock")!.textContent).toContain("looks private");
    expect(q("choice")).toBeNull();
    q("lock")!.click();
    expect(q("choice")).not.toBeNull();
    (q("choose-remember") as HTMLInputElement).click();
    q("choose-local")!.click();
    expect(handlers.onChoose).toHaveBeenCalledWith("local", true);
    expect(q("choice")).toBeNull();
  });

  it("goes away again when the page turns out fine", () => {
    const { chip } = setup();
    chip.set("sensitive");
    chip.set("normal");
    expect(chip.el.hidden).toBe(true);
  });
});

describe("LockChip for a page a site rule makes sensitive", () => {
  it("says so and cannot be pressed, since the rule is not the lock's to change", () => {
    const { chip, handlers, q } = setup();
    chip.set("sensitive", true);
    expect(q("lock")!.textContent).toContain("rule");
    expect((q("lock") as HTMLButtonElement).disabled).toBe(true);
    q("lock")!.click();
    expect(handlers.onUnmark).not.toHaveBeenCalled();
  });
});
