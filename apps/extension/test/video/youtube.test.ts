import { describe, expect, it } from "vitest";
import {
  formatTimestamp,
  isWatchPage,
  sourceIdFor,
  videoIdFromSourceId,
  videoIdFromUrl,
  watchUrl,
  watchUrlAt,
  youtubeSource,
} from "../../src/lib/video/youtube";

const ID = "dQw4w9WgXcQ";

describe("videoIdFromUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=754s&list=PL123&index=4`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
  ])("finds the video in %s", (url) => {
    expect(videoIdFromUrl(url)).toBe(ID);
  });

  it.each([
    "https://www.youtube.com/",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL123",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "not a url",
  ])("finds nothing in %s", (url) => {
    expect(videoIdFromUrl(url)).toBeNull();
  });
});

describe("isWatchPage", () => {
  it("is true only for a watch page on youtube.com", () => {
    expect(isWatchPage(`https://www.youtube.com/watch?v=${ID}`)).toBe(true);
    expect(isWatchPage(`https://youtube.com/watch?v=${ID}&t=5`)).toBe(true);
    expect(isWatchPage(`https://www.youtube.com/shorts/${ID}`)).toBe(false);
    expect(isWatchPage(`https://www.youtube.com/embed/${ID}`)).toBe(false);
    expect(isWatchPage(`https://m.youtube.com/watch?v=${ID}`)).toBe(false);
    expect(isWatchPage("https://www.youtube.com/")).toBe(false);
  });
});

describe("source identity", () => {
  it("gives every link to a video the same source id and address", () => {
    const a = youtubeSource(videoIdFromUrl(`https://youtu.be/${ID}?t=30`)!, "A talk");
    const b = youtubeSource(videoIdFromUrl(`https://www.youtube.com/watch?v=${ID}&list=PL1&index=2`)!, "A talk");
    expect(a).toEqual(b);
    expect(a.source_id).toBe(`youtube:${ID}`);
    expect(a.ids).toEqual({ url: `https://www.youtube.com/watch?v=${ID}` });
  });

  it("tidies the title", () => {
    expect(youtubeSource(ID, "  A \n talk  ").title).toBe("A talk");
  });

  it("round-trips a source id", () => {
    expect(videoIdFromSourceId(sourceIdFor(ID))).toBe(ID);
    expect(videoIdFromSourceId("arxiv:2106.09685")).toBeNull();
    expect(videoIdFromSourceId("youtube:nope")).toBeNull();
  });
});

describe("timestamps", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [754, "12:34"],
    [3600, "1:00:00"],
    [3725.9, "1:02:05"],
    [-3, "0:00"],
  ])("formats %s as %s", (seconds, text) => {
    expect(formatTimestamp(seconds)).toBe(text);
  });

  it("links to the video at a position", () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(watchUrlAt(ID, 754.8)).toBe(`https://www.youtube.com/watch?v=${ID}&t=754s`);
  });
});
