import { describe, expect, it } from "vitest";
import { exportMarkdown, parseJsonl, replay, serializeJsonl } from "../src";
import { concept, encounter, ev, id } from "./helpers";

const events = [
  ev("source.seen", { source_id: "arxiv:1", ids: {}, title: "LoRA Paper", license: "unknown", sensitivity: "normal" }),
  concept(1, "LoRA", "ml", ["Low-Rank Adaptation"]),
  encounter(10, 1, "arxiv:1", "2026-09-10T00:00:00Z"),
  concept(2, "QLoRA"),
  concept(3, "Attention"),
  encounter(11, 3, "arxiv:1"),
  ev("encounter.deleted", { encounter_id: id(11) }),
];

describe("JSONL", () => {
  it("round-trips events", () => {
    const text = serializeJsonl(events);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseJsonl(text)).toEqual({ events, future: [], skipped: [] });
  });

  it("skips a partial last line, invalid lines and oversized lines; keeps future events", () => {
    const lines = serializeJsonl(events.slice(0, 2)).split("\n").filter(Boolean);
    const future = JSON.stringify({ v: 2, type: "new.thing" });
    const huge = JSON.stringify({ v: 1, pad: "x".repeat(70000) });
    const text = [lines[0], "not json", future, huge, lines[1], '{"v":1,"id":"01J'].join("\n");
    const r = parseJsonl(text);
    expect(r.events).toHaveLength(2);
    expect(r.future).toHaveLength(1);
    expect(r.skipped).toEqual([
      { line: 2, reason: "invalid_json" },
      { line: 4, reason: "too_large" },
      { line: 6, reason: "partial" },
    ]);
  });
});

describe("exportMarkdown", () => {
  it("lists real concepts with their encounters and skips placeholders and deleted encounters", () => {
    const md = exportMarkdown(replay(events), "zh");
    expect(md).toContain("## LoRA");
    expect(md).toContain("Low-Rank Adaptation");
    expect(md).toContain("2026-09-10 · 《LoRA Paper》 · 外部知识");
    expect(md).toContain("explanation 10");
    expect(md).not.toContain("QLoRA");
    expect(md).not.toContain("Attention");
  });

  it("labels entries in the requested language", () => {
    const md = exportMarkdown(replay(events), "en");
    expect(md).toContain("2026-09-10 · “LoRA Paper” · External knowledge");
  });
});
