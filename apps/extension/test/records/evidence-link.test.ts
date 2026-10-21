import { describe, expect, it } from "vitest";
import { evidenceLink } from "../../src/lib/records/history";

describe("evidenceLink", () => {
  it("opens the page at a short passage, or at the first and last words of a long one", () => {
    expect(evidenceLink("https://example.com/a", "rank decomposition, here")).toBe(
      "https://example.com/a#:~:text=rank%20decomposition%2C%20here",
    );
    // A page routed by its fragment keeps it.
    expect(evidenceLink("https://docs.example.com/#/guide/attention", "rank decomposition, here")).toBe(
      "https://docs.example.com/#/guide/attention:~:text=rank%20decomposition%2C%20here",
    );
    expect(evidenceLink("https://example.com/a", "one two three four five six seven eight nine ten eleven")).toBe(
      "https://example.com/a#:~:text=one%20two%20three%20four%20five,seven%20eight%20nine%20ten%20eleven",
    );
  });

  it("gives nothing without a web address or a passage, or for a moment in a video", () => {
    expect(evidenceLink(null, "a passage long enough")).toBeNull();
    expect(evidenceLink("file:///tmp/a.pdf", "a passage long enough")).toBeNull();
    expect(evidenceLink("https://www.youtube.com/watch?v=x&t=754s", "a passage long enough")).toBeNull();
    expect(evidenceLink("https://example.com/a", null)).toBeNull();
    expect(evidenceLink("https://example.com/a", "tiny")).toBeNull();
  });
});
