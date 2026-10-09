import { describe, expect, it } from "vitest";
import type { HarkEvent } from "@harkback/spec";
import { Matcher, matcherEntriesFromState, replay, selectReunions } from "../../src";
import { action, concept, encounter, ev, id } from "../helpers";

const NOW = Date.parse("2026-09-24T00:00:00Z");

function run(events: HarkEvent[], text: string, sourceId = "arxiv:2") {
  const state = replay(events);
  const hits = new Matcher(matcherEntriesFromState(state)).scan(text);
  return selectReunions(state, hits, { sourceId, now: NOW });
}

describe("selectReunions: direct", () => {
  it("offers a reunion for a concept looked up in another source long enough ago", () => {
    const r = run([concept(1, "LoRA"), encounter(10, 1, "arxiv:1", "2026-09-10T00:00:00Z")], "We use LoRA.");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "direct", conceptId: id(1) });
    expect(r[0]!.encounter.id).toBe(id(10));
  });

  it("skips concepts touched within the gap, even through a reunion action", () => {
    expect(run([concept(1, "LoRA"), encounter(10, 1, "arxiv:1", "2026-09-22T00:00:00Z")], "LoRA")).toEqual([]);
    expect(
      run(
        [concept(1, "LoRA"), encounter(10, 1, "arxiv:1", "2026-09-01T00:00:00Z"), action(10, "reunion_recalled", "2026-09-23T00:00:00Z")],
        "LoRA",
      ),
    ).toEqual([]);
  });

  it("skips concepts only seen in the current source, and muted concepts", () => {
    expect(run([concept(1, "LoRA"), encounter(10, 1, "arxiv:2", "2026-09-01T00:00:00Z")], "LoRA")).toEqual([]);
    expect(
      run([concept(1, "LoRA"), encounter(10, 1, "arxiv:1", "2026-09-01T00:00:00Z"), ev("concept.muted", { concept_id: id(1) })], "LoRA"),
    ).toEqual([]);
  });

  it("does not crash or fire when the encounter time is in the future (clock skew)", () => {
    expect(run([concept(1, "LoRA"), encounter(10, 1, "arxiv:1", "2026-10-30T00:00:00Z")], "LoRA")).toEqual([]);
  });

  it("requires corroboration for ambiguous names", () => {
    const events = [
      concept(1, "SAM"),
      encounter(10, 1, "arxiv:1", "2026-09-01T00:00:00Z"),
      concept(2, "LoRA"),
      encounter(11, 2, "arxiv:1", "2026-09-01T00:00:00Z"),
    ];
    expect(run(events, "SAM is used").map((x) => x.conceptId)).toEqual([]);
    expect(
      run(events, "SAM with LoRA")
        .map((x) => x.conceptId)
        .sort(),
    ).toEqual([id(1), id(2)].sort());
  });

  it("caps at three per page, confused concepts first, then the longest gap", () => {
    const events = [
      concept(1, "alpha"),
      encounter(11, 1, "arxiv:1", "2026-09-05T00:00:00Z"),
      concept(2, "beta"),
      encounter(12, 2, "arxiv:1", "2026-09-01T00:00:00Z"),
      concept(3, "gamma"),
      encounter(13, 3, "arxiv:1", "2026-09-10T00:00:00Z"),
      concept(4, "delta"),
      encounter(14, 4, "arxiv:1", "2026-09-15T00:00:00Z"),
      action(14, "marked_confused", "2026-09-15T01:00:00Z"),
    ];
    expect(run(events, "alpha beta gamma delta").map((x) => x.conceptId)).toEqual([id(4), id(2), id(1)]);
  });
});

describe("selectReunions: related", () => {
  const base = [concept(1, "LoRA"), encounter(10, 1, "arxiv:1", "2026-09-10T00:00:00Z"), concept(2, "QLoRA")];
  const proposed = (confidence: number) =>
    ev("edge.proposed", { from: id(2), to: id(1), rel: "variant_of", source: "llm_explain", confidence, evidence: {} });

  it("offers a related reunion through a confident variant_of edge", () => {
    const r = run([...base, proposed(0.7)], "QLoRA quantizes weights");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "related", conceptId: id(2), viaConceptId: id(1) });
  });

  it("uses confirmed edges regardless of confidence and ignores weak or rejected ones", () => {
    expect(run([...base, proposed(0.6)], "QLoRA")).toEqual([]);
    expect(run([...base, proposed(0.3), ev("edge.confirmed", { edge_id: `${id(2)}>variant_of>${id(1)}` })], "QLoRA")).toHaveLength(1);
    expect(run([...base, proposed(0.8), ev("edge.rejected", { edge_id: `${id(2)}>variant_of>${id(1)}` })], "QLoRA")).toEqual([]);
  });

  it("does not duplicate a direct reunion for the same concept", () => {
    const r = run([...base, proposed(0.8)], "QLoRA builds on LoRA");
    expect(r.map((x) => x.kind)).toEqual(["direct"]);
  });
});
