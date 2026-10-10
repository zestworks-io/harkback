// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowCaptionSelection, SELECTABLE, setSelectable } from "../../src/lib/video/caption-select";

const WINDOW = ".ytp-caption-window-container";
let container: HTMLElement;
let segment: HTMLElement;
const player = vi.fn();
let paused = true;

beforeEach(() => {
  document.head.replaceChildren();
  document.body.innerHTML = `<div id="player"><div class="ytp-caption-window-container"><span class="seg">LoRA</span></div></div>`;
  container = document.querySelector<HTMLElement>(WINDOW)!;
  segment = document.querySelector<HTMLElement>(".seg")!;
  document.getElementById("player")!.addEventListener("click", player);
  document.getElementById("player")!.addEventListener("mousedown", player);
  player.mockClear();
  paused = true;
});

describe("allowCaptionSelection", () => {
  it("keeps clicks and drags on the captions from the player while the video is paused", () => {
    allowCaptionSelection(document, container, WINDOW, () => paused);
    for (const type of ["mousedown", "click"]) segment.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    expect(player).not.toHaveBeenCalled();
  });

  it("leaves the player alone while the video plays", () => {
    allowCaptionSelection(document, container, WINDOW, () => paused);
    paused = false;
    for (const type of ["mousedown", "click"]) segment.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    expect(player).toHaveBeenCalledTimes(2);
  });

  it("lets a listener on the document in the capture phase see the event first", () => {
    const seen = vi.fn();
    document.addEventListener("mouseup", seen, true);
    allowCaptionSelection(document, container, WINDOW, () => paused);
    segment.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    document.removeEventListener("mouseup", seen, true);
  });

  it("adds its style once, and stops when released", () => {
    const release = allowCaptionSelection(document, container, WINDOW, () => paused);
    allowCaptionSelection(document, document.createElement("div"), WINDOW, () => paused);
    expect(document.querySelectorAll("#hb-caption-select")).toHaveLength(1);
    expect(document.getElementById("hb-caption-select")!.textContent).toContain(`${WINDOW}[${SELECTABLE}]`);
    setSelectable(container, true);
    release();
    expect(container.hasAttribute(SELECTABLE)).toBe(false);
    segment.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(player).toHaveBeenCalledTimes(1);
  });
});

describe("setSelectable", () => {
  it("marks and unmarks the window, and ignores a missing one", () => {
    setSelectable(container, true);
    expect(container.hasAttribute(SELECTABLE)).toBe(true);
    setSelectable(container, false);
    expect(container.hasAttribute(SELECTABLE)).toBe(false);
    expect(() => setSelectable(null, true)).not.toThrow();
  });
});
