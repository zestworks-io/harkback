// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { matcherEntriesFromState, replay, type Hit } from "@harkback/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentApp } from "../../src/lib/content/app";
import type { Rpc } from "../../src/lib/content/rpc";
import type { PageInfo, PortIn, Request } from "../../src/lib/messaging/messages";
import { reunionCards } from "../../src/lib/records/reunion-cards";
import { CaptionTracker } from "../../src/lib/video/caption-tracker";
import { createYouTubeSource } from "../../src/lib/video/youtube-source";
import { world } from "../helpers";

const FIXTURE = readFileSync("apps/extension/fixtures/youtube/captions.html", "utf8");
const DAY = 86_400_000;
const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const OTHER = "https://www.youtube.com/watch?v=aaaaaaaaaaa";

const w = world();
w.source("arxiv:2106.09685", "normal", "LoRA paper");
const lora = w.concept("LoRA", ["Low-Rank Adaptation"]);
w.encounter(lora, "arxiv:2106.09685", "A way to fine-tune with low rank updates.");
const attention = w.concept("Attention");
w.encounter(attention, "arxiv:2106.09685", "Weighs the tokens against each other.");
const state = replay(w.events);
const entries = matcherEntriesFromState(state);
const now = Date.UTC(2026, 8, 1) + 3 * DAY;

let url = WATCH;
let app: ContentApp;
let maxPerPage = 10;
const asked: Request[] = [];
const posted: PortIn[] = [];

const info = (): PageInfo => ({
  enabled: true,
  autoScan: true,
  scan: true,
  incognito: false,
  language: "en",
  strings: {},
  theme: "system",
  models: [],
  entries,
});

const rpc: Rpc = {
  request: (async (msg: Request) => {
    asked.push(msg);
    if (msg.type === "page-info") return info();
    if (msg.type === "reunions")
      return { cards: reunionCards(state, msg.hits as Hit[], { sourceId: msg.sourceId, now, minGapDays: 0, maxPerPage }) };
    return { ok: true };
  }) as Rpc["request"],
  connect: () => ({
    postMessage: (m) => posted.push(m),
    disconnect: () => undefined,
    onMessage: { addListener: () => undefined },
    onDisconnect: { addListener: () => undefined },
  }),
};

const reunionCalls = () => asked.filter((m) => m.type === "reunions");

function showLines(...texts: string[]): void {
  document.querySelector(".captions-text")!.innerHTML = texts
    .map((t) => `<span class="caption-visual-line"><span class="ytp-caption-segment">${t}</span></span>`)
    .join("");
}

const marks = (): number => {
  const host = [...document.documentElement.children].find((e) => e.shadowRoot);
  return host?.shadowRoot?.querySelectorAll('[data-hb="mark"]').length ?? 0;
};

/** Mutation records arrive on a microtask, and the caption must then hold still. */
const settle = async (ms = 400) => {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(async () => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = FIXTURE.replace(/^[\s\S]*?<html>|<\/html>[\s\S]*$/g, "");
  asked.length = 0;
  maxPerPage = 10;
  posted.length = 0;
  url = WATCH;
  showLines("so we fine-tune with LoRA", "which trains low rank adapters");
  Object.defineProperty(document.querySelector("video")!, "currentTime", { value: 41.7, configurable: true });
  app = new ContentApp(rpc, "open", createYouTubeSource(document, new CaptionTracker(document, () => url)));
  await app.start();
  await settle();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ContentApp on a video", () => {
  it("underlines a term the reader has met before in the caption on screen", () => {
    expect(marks()).toBe(1);
  });

  it("underlines it again on a later caption without asking again", async () => {
    showLines("and LoRA is cheap to train");
    await settle();
    expect(marks()).toBe(1);
    showLines("nothing to see here");
    await settle();
    expect(marks()).toBe(0);
    showLines("LoRA once more");
    await settle();
    expect(marks()).toBe(1);
    expect(reunionCalls()).toHaveLength(1);
  });

  it("removes the underline when the caption goes away", async () => {
    showLines();
    await settle();
    expect(marks()).toBe(0);
  });

  it("does not show a term again after the reader said they remember it", async () => {
    const [card] = reunionCards(state, [{ key: entries.find((e) => e.pattern === "LoRA")!.key, start: 0, end: 4, text: "LoRA" }], {
      sourceId: "youtube:dQw4w9WgXcQ",
      now,
      minGapDays: 0,
      maxPerPage: 10,
    });
    // The card's own buttons are drawn in the overlay; this is what they call.
    (app as unknown as { onReunionAction(c: unknown, a: string, r: Range): void }).onReunionAction(
      card,
      "recalled",
      document.createRange(),
    );
    showLines("LoRA again");
    await settle();
    expect(marks()).toBe(0);
  });

  it("starts afresh on another video, with the records read again", async () => {
    const infoBefore = asked.filter((m) => m.type === "page-info").length;
    url = OTHER;
    showLines("LoRA in a different talk");
    await settle(1200);
    expect(marks()).toBe(1);
    expect(reunionCalls().length).toBeGreaterThanOrEqual(2);
    expect(asked.filter((m) => m.type === "page-info").length).toBe(infoBefore + 1);
  });

  it("applies the limit on cards to the screen, not to each new term", async () => {
    maxPerPage = 1;
    showLines("LoRA and attention");
    await settle();
    expect(marks()).toBe(1);
    showLines("only attention");
    await settle();
    expect(marks()).toBe(1);
    const asks = reunionCalls().length;
    showLines("LoRA and attention");
    await settle();
    expect(marks()).toBe(1);
    expect(reunionCalls()).toHaveLength(asks);
  });

  it("does not read a page that is not a video", async () => {
    url = "https://www.youtube.com/";
    showLines("LoRA on the home page");
    await settle(1200);
    expect(marks()).toBe(0);
  });

  it("explains a selection from the captions shown, at the playback position", async () => {
    showLines("and then LoRA adds a small matrix");
    await settle();
    const text = document.querySelector(".ytp-caption-segment")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, "and then ".length);
    range.setEnd(text, "and then LoRA".length);
    app.explain(range, { mode: "explain" });
    const start = posted.find((m) => m.type === "start");
    expect(start?.type === "start" && start.request).toMatchObject({
      selection: "LoRA",
      source: { source_id: "youtube:dQw4w9WgXcQ", ids: { url: WATCH } },
      locator: { exact: "LoRA", t: 41 },
    });
    if (start?.type !== "start") throw new Error("not started");
    // The earlier caption is context too, and a definition quoted from it can be checked.
    expect(start.request.paragraph).toContain("which trains low rank adapters");
    expect(start.request.pageText).toContain("so we fine-tune with LoRA");
    expect(start.request.pageText).toContain("and then LoRA adds a small matrix");
  });

  it("explains again from the text it kept when the caption has gone, as a retry does", async () => {
    showLines("and then LoRA adds a small matrix");
    await settle();
    posted.length = 0;
    showLines("something else entirely");
    await settle();
    app.explain(document.createRange(), { mode: "explain", text: "LoRA" });
    const start = posted.find((m) => m.type === "start");
    expect(start?.type === "start" && start.request.selection).toBe("LoRA");
    expect(start?.type === "start" && start.request.locator.t).toBe(41);
  });

  it("explains a selection outside the captions like on any page, with no position", () => {
    document.body.insertAdjacentHTML("beforeend", '<p id="description">Today we look at gradient checkpointing.</p>');
    const text = document.querySelector("#description")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, "Today we look at ".length);
    range.setEnd(text, "Today we look at gradient".length);
    app.explain(range, { mode: "explain" });
    const start = posted.find((m) => m.type === "start");
    if (start?.type !== "start") throw new Error("nothing was explained");
    expect(start.request.selection).toBe("gradient");
    expect(start.request.source.source_id).toBe("youtube:dQw4w9WgXcQ");
    expect(start.request.locator).not.toHaveProperty("t");
    expect(start.request.paragraph).toContain("gradient checkpointing");
  });
});
