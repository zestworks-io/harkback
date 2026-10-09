import { describe, expect, it } from "vitest";
import { conceptNote } from "../../src/lib/export/notes";
import { conceptDetail } from "../../src/lib/records/concept-detail";
import { historyEntries, sourceUrl } from "../../src/lib/records/history";
import { reunionCards } from "../../src/lib/records/reunion-cards";
import { reviewQueue } from "../../src/lib/review/review";
import { world } from "../helpers";

const ID = "dQw4w9WgXcQ";
const SOURCE = `youtube:${ID}`;
const DAY = 86_400_000;

function build() {
  const w = world();
  w.source(SOURCE, "normal", "A talk on LoRA", { url: `https://www.youtube.com/watch?v=${ID}` });
  w.source("arxiv:2106.09685", "normal", "LoRA paper", { url: "https://arxiv.org/abs/2106.09685" });
  const lora = w.concept("LoRA");
  const video = w.encounter(lora, SOURCE, "Trains low-rank adapters.", 754);
  const paper = w.encounter(lora, "arxiv:2106.09685", "Freezes weights.");
  return { w, lora, video, paper };
}

describe("history entries", () => {
  it("open a video at the moment it was met, and carry the position", () => {
    const { w, lora, video } = build();
    const entry = historyEntries(w.state(), lora).find((e) => e.encounterId === video)!;
    expect(entry.t).toBe(754);
    expect(entry.sourceUrl).toBe(`https://www.youtube.com/watch?v=${ID}&t=754s`);
  });

  it("leave an ordinary source alone", () => {
    const { w, lora, paper } = build();
    const entry = historyEntries(w.state(), lora).find((e) => e.encounterId === paper)!;
    expect(entry.t).toBeNull();
    expect(entry.sourceUrl).toBe("https://arxiv.org/abs/2106.09685");
  });

  it("open the video from the start when it was recorded without a position", () => {
    const w = world();
    w.source(SOURCE, "normal", "A talk", { url: `https://www.youtube.com/watch?v=${ID}` });
    const c = w.concept("LoRA");
    w.encounter(c, SOURCE);
    expect(historyEntries(w.state(), c)[0]!.sourceUrl).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it("never turn a position into a link for a source that is not a video", () => {
    const { w } = build();
    expect(sourceUrl(w.state(), "arxiv:2106.09685", 30)).toBe("https://arxiv.org/abs/2106.09685");
  });
});

describe("reunion cards", () => {
  const meet = (w: ReturnType<typeof world>) =>
    reunionCards(w.state(), [{ key: "LoRA", start: 0, end: 4, text: "LoRA" }], {
      sourceId: "url:https://example.com/new",
      now: Date.UTC(2026, 8, 1) + 3 * DAY,
      minGapDays: 1,
      maxPerPage: 5,
    });

  it("say where in the video the term was met", () => {
    const w = world();
    w.source(SOURCE, "normal", "A talk");
    w.encounter(w.concept("LoRA"), SOURCE, "Trains low-rank adapters.", 754);
    const [card] = meet(w);
    expect(card).toMatchObject({ t: 754, section: "", sourceTitle: "A talk" });
  });

  it("have no position for a paper", () => {
    const w = world();
    w.source("arxiv:2106.09685", "normal", "LoRA paper");
    w.encounter(w.concept("LoRA"), "arxiv:2106.09685");
    const [card] = meet(w);
    expect(card).toMatchObject({ t: null, section: "2 Method" });
  });
});

describe("review items", () => {
  it("open the video where the term was last met", () => {
    const w = world();
    w.source(SOURCE, "normal", "A talk", { url: `https://www.youtube.com/watch?v=${ID}` });
    const c = w.concept("LoRA");
    w.encounter(c, SOURCE, "Trains low-rank adapters.", 90);
    const item = reviewQueue(w.state(), Date.UTC(2026, 8, 1) + 3 * DAY)[0]!;
    expect(item.t).toBe(90);
    expect(item.sourceUrl).toBe(`https://www.youtube.com/watch?v=${ID}&t=90s`);
  });
});

describe("Obsidian notes", () => {
  it("link the timeline entry to the moment in the video", () => {
    const { w, lora } = build();
    const note = conceptNote(conceptDetail(w.state(), lora)!, "en");
    expect(note).toContain(`“A talk on LoRA” [12:34](https://www.youtube.com/watch?v=${ID}&t=754s)`);
    expect(note).toContain("“LoRA paper” ·");
  });
});
