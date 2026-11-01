import { describe, expect, it } from "vitest";
import { replay, withoutSensitive } from "../../src";
import { concept, ev, id } from "../helpers";

const created = (n: number, sourceId: string, ts = "2026-09-01T00:00:00Z") =>
  ev(
    "encounter.created",
    {
      encounter_id: id(n),
      concept_id: id(1),
      source_id: sourceId,
      locator: { exact: "LoRA", prefix: "", suffix: "" },
      selection: "LoRA",
      explanation: { text: "Low-rank adapters.", tier: "external_knowledge", evidence_span: null, model: "m" },
      flags: [],
    },
    { ts },
  );
const shown = (conceptN: number, sourceId: string, ts = "2026-09-10T00:00:00Z") =>
  ev("reunion.shown", { concept_id: id(conceptN), source_id: sourceId }, { ts });
const seen = (sourceId: string, sensitivity: "normal" | "sensitive") =>
  ev("source.seen", { source_id: sourceId, ids: {}, title: "", license: "unknown", sensitivity });

describe("reunions shown", () => {
  it("keeps when each was shown, under the concept it now belongs to", () => {
    const state = replay([
      concept(1, "LoRA"),
      concept(2, "Low-Rank Adaptation"),
      created(10, "arxiv:1"),
      shown(1, "arxiv:2"),
      shown(2, "arxiv:3", "2026-09-11T00:00:00Z"),
      ev("concept.merged", { from: id(2), into: id(1) }),
    ]);
    expect(state.reunionsShown).toEqual([
      { conceptId: id(1), sourceId: "arxiv:2", at: Date.parse("2026-09-10T00:00:00Z") },
      { conceptId: id(1), sourceId: "arxiv:3", at: Date.parse("2026-09-11T00:00:00Z") },
    ]);
  });

  it("touches nothing: when the term was last touched, and so when the next reunion is due, stay as they were", () => {
    const base = [concept(1, "LoRA"), created(10, "arxiv:1")];
    const before = replay(base).encounters.get(id(10))!;
    const after = replay([...base, shown(1, "arxiv:2")]).encounters.get(id(10))!;
    expect(after.lastTouchedAt).toBe(before.lastTouchedAt);
    expect(after.actions).toEqual([]);
  });

  it("skips one for a concept it does not know", () => {
    expect(replay([concept(1, "LoRA"), shown(9, "arxiv:2")]).reunionsShown).toEqual([]);
  });

  it("is left out of an export without sensitive sources when its page is sensitive", () => {
    const events = [
      concept(1, "LoRA"),
      seen("arxiv:1", "normal"),
      seen("arxiv:2", "sensitive"),
      created(10, "arxiv:1"),
      shown(1, "arxiv:1"),
      shown(1, "arxiv:2"),
    ];
    const kept = withoutSensitive(events)
      .filter((e) => e.type === "reunion.shown")
      .map((e) => (e.payload as { source_id: string }).source_id);
    expect(kept).toEqual(["arxiv:1"]);
  });
});
