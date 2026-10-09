// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptionTracker, MAX_WAIT_MS, SELECTORS, SETTLE_MS } from "../../src/lib/video/caption-tracker";

const FIXTURE = readFileSync("apps/extension/fixtures/youtube/captions.html", "utf8");
const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

let url = WATCH;
let tracker: CaptionTracker;
let stop: () => void = () => undefined;
const settled = vi.fn();
const reset = vi.fn();

const lineEls = () => [...document.querySelectorAll(SELECTORS.line)];
const video = () => document.querySelector("video")!;

function showLines(...texts: string[]): void {
  const holder = document.querySelector(".captions-text")!;
  holder.replaceChildren(
    ...texts.map((t) => {
      const line = document.createElement("span");
      line.className = "caption-visual-line";
      const seg = document.createElement("span");
      seg.className = "ytp-caption-segment";
      seg.textContent = t;
      line.append(seg);
      return line;
    }),
  );
}

/** happy-dom delivers mutation records on a microtask. */
const tick = async (ms = 0) => {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = FIXTURE.replace(/^[\s\S]*?<html>|<\/html>[\s\S]*$/g, "");
  document.title = "(2) Low-Rank Adaptation, explained - YouTube";
  url = WATCH;
  settled.mockClear();
  reset.mockClear();
  tracker = new CaptionTracker(document, () => url);
  Object.defineProperty(video(), "currentTime", { value: 41.7, configurable: true });
});

afterEach(() => {
  stop();
  stop = () => undefined;
  vi.useRealTimers();
});

describe("CaptionTracker page and identity", () => {
  it("knows the video and tidies the title", () => {
    expect(tracker.currentVideoId()).toBe("dQw4w9WgXcQ");
    expect(tracker.active()).toBe(true);
    expect(tracker.title()).toBe("Low-Rank Adaptation, explained");
    expect(tracker.currentTime()).toBe(41);
  });

  it("is not active outside a watch page", () => {
    url = "https://www.youtube.com/";
    expect(tracker.active()).toBe(false);
    url = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
    expect(tracker.active()).toBe(false);
  });

  it("builds a page with the lines kept apart and ranges that land on the right words", () => {
    const page = tracker.page();
    expect(page.text).toBe("we fine-tune with LoRA\nwhich trains low rank adapters");
    expect(page.blocks).toHaveLength(2);
    const at = page.text.indexOf("LoRA");
    const seg = page.segments.find((s) => s.start <= at && at < s.end)!;
    expect(seg.node.textContent).toBe("we fine-tune with LoRA");
    const adapters = page.text.indexOf("adapters");
    expect(page.segments.find((s) => s.start <= adapters && adapters < s.end)!.node.textContent).toBe("which trains low rank adapters");
  });

  it("falls back to bare caption segments when there are no line wrappers", () => {
    document.querySelector(".captions-text")!.innerHTML =
      '<span class="ytp-caption-segment">first</span><span class="ytp-caption-segment">second</span>';
    expect(tracker.page().text).toBe("first\nsecond");
  });

  it("gives an empty page when no captions are showing", () => {
    document.querySelector(SELECTORS.captionWindow)!.remove();
    const page = tracker.page();
    expect(page.text).toBe("");
    expect(page.segments).toEqual([]);
  });
});

describe("CaptionTracker settling", () => {
  it("reads the captions that are already showing when it starts", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(tracker.buffer.text()).toBe("we fine-tune with LoRA which trains low rank adapters");
  });

  it("waits for a caption to hold still", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    settled.mockClear();
    showLines("we apply");
    await tick(SETTLE_MS - 50);
    showLines("we apply low rank");
    await tick(SETTLE_MS - 50);
    expect(settled).not.toHaveBeenCalled();
    await tick(100);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(tracker.buffer.text()).toContain("we apply low rank");
    expect(tracker.buffer.text()).not.toContain("we apply low rank we apply");
  });

  it("reads a caption that keeps changing no later than the maximum wait", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    settled.mockClear();
    let words = "word";
    for (let spent = 0; spent < MAX_WAIT_MS + 200 && settled.mock.calls.length === 0; spent += 100) {
      words += " word";
      showLines(words);
      await tick(100);
    }
    expect(settled).toHaveBeenCalled();
  });

  it("reads at once when the video is paused", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    settled.mockClear();
    showLines("a definition we should look at");
    await tick(10);
    video().dispatchEvent(new Event("pause"));
    expect(settled).toHaveBeenCalledTimes(1);
    expect(tracker.buffer.text()).toContain("a definition we should look at");
  });

  it("reports when the captions go away", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    settled.mockClear();
    document.querySelector(SELECTORS.captionWindow)!.remove();
    await tick(1100);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(tracker.page().text).toBe("");
  });

  it("does nothing outside a watch page", async () => {
    url = "https://www.youtube.com/";
    stop = tracker.watch(settled, reset);
    showLines("anything");
    await tick(2000);
    expect(settled).not.toHaveBeenCalled();
    expect(tracker.buffer.size).toBe(0);
  });

  it("stops reading when stopped", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    stop();
    settled.mockClear();
    showLines("after stopping");
    await tick(2000);
    expect(settled).not.toHaveBeenCalled();
  });
});

describe("CaptionTracker navigation", () => {
  it("forgets the buffer and says so when another video opens", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    expect(tracker.buffer.size).toBeGreaterThan(0);
    url = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
    showLines("a different talk");
    await tick(1100);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(tracker.buffer.text()).not.toContain("LoRA");
    expect(tracker.buffer.text()).toContain("a different talk");
  });

  it("clears and says so when leaving the watch page", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    url = "https://www.youtube.com/";
    await tick(1100);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(tracker.buffer.size).toBe(0);
  });
});

describe("CaptionTracker context", () => {
  it("gives the surrounding captions and the playback position", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    const c = tracker.context("LoRA")!;
    expect(c.selection).toBe("LoRA");
    expect(c.paragraph).toContain("which trains low rank adapters");
    expect(c.locator).toMatchObject({ exact: "LoRA", prefix: "we fine-tune with", suffix: "which trains low rank adapters", t: 41 });
    expect(c.paragraphId).toBe("dQw4w9WgXcQ:41");
  });

  it("reads the screen first, so a selection made before the caption settled is still found", () => {
    showLines("a brand new line about RLHF");
    expect(tracker.context("RLHF")?.locator.t).toBe(41);
  });

  it("is null for a selection that was never shown", () => {
    expect(tracker.context("transformer")).toBeNull();
  });
});

describe("CaptionTracker title", () => {
  it("does not pair a new video with the last video's title", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    url = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
    await tick(1100);
    expect(tracker.title()).toBe("");
    document.title = "A different talk - YouTube";
    expect(tracker.title()).toBe("A different talk");
  });

  it("trusts the title again if the page never changes it", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    url = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
    await tick(1100);
    await tick(6000);
    expect(tracker.title()).toBe("Low-Rank Adaptation, explained");
  });

  it("has the title at once when the page changed it before the video was noticed", async () => {
    stop = tracker.watch(settled, reset);
    await tick();
    document.title = "A different talk - YouTube";
    url = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
    await tick(1100);
    expect(tracker.title()).toBe("A different talk");
  });
});

describe("CaptionTracker in a hidden tab", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "hidden");
  });

  it("reads nothing until the tab is shown", async () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    stop = tracker.watch(settled, reset);
    await tick(3000);
    expect(settled).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "hidden");
    await tick(1100);
    expect(settled).toHaveBeenCalled();
  });
});

describe("CaptionTracker selections across lines", () => {
  it("gives a selection that ran over a line break with its space", () => {
    const c = tracker.context("rank adapters")!;
    expect(c.selection).toBe("rank adapters");
    showLines("we fine-tune with low-rank", "adaptation modules");
    const across = tracker.context("low-rankadaptation")!;
    expect(across.selection).toBe("low-rank adaptation");
    expect(across.locator.exact).toBe("low-rank adaptation");
  });
});

describe("CaptionTracker when the player changes", () => {
  it("fails closed and says so once", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    document.querySelector(SELECTORS.captionWindow)!.remove();
    stop = tracker.watch(settled, reset);
    await tick(15_000);
    expect(settled).not.toHaveBeenCalled();
    expect(tracker.buffer.size).toBe(0);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0]![0])).toContain(SELECTORS.captionWindow);
    debug.mockRestore();
  });

  it("names the player when even that is missing", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    document.querySelector(SELECTORS.player)!.remove();
    stop = tracker.watch(settled, reset);
    await tick(15_000);
    expect(String(debug.mock.calls[0]![0])).toContain(SELECTORS.player);
    debug.mockRestore();
  });
});

describe("fixture", () => {
  it("has the structure the selectors expect", () => {
    expect(document.querySelector(SELECTORS.player)).not.toBeNull();
    expect(document.querySelector(SELECTORS.captionWindow)).not.toBeNull();
    expect(lineEls()).toHaveLength(2);
  });
});
