import { describe, expect, it } from "vitest";
import { findCandidates, replay } from "../../src";
import { concept, encounter, id } from "../helpers";

const state = replay([
  concept(1, "LoRA", "ml", ["Low-Rank Adaptation"]),
  encounter(10, 1, "arxiv:1"),
  concept(2, "QLoRA"),
  concept(3, "attention"),
  concept(4, "Adapter"),
]);

describe("findCandidates", () => {
  it("ranks an exact alias hit first with score 1", () => {
    const c = findCandidates(state, "LoRA");
    expect(c[0]).toMatchObject({ conceptId: id(1), score: 1, isPlaceholder: false });
  });

  it("finds fuzzy matches", () => {
    const c = findCandidates(state, "low rank adapter");
    expect(c[0]?.conceptId).toBe(id(1));
    expect(c[0]!.score).toBeGreaterThan(0.5);
  });

  it("includes placeholder concepts", () => {
    const c = findCandidates(state, "QLoRA");
    expect(c[0]).toMatchObject({ conceptId: id(2), isPlaceholder: true });
  });

  it("excludes scores below the minimum and respects k", () => {
    expect(findCandidates(state, "photosynthesis")).toEqual([]);
    expect(findCandidates(state, "LoRA", 1)).toHaveLength(1);
  });

  it("returns nothing for an empty query", () => {
    expect(findCandidates(state, " ,. ")).toEqual([]);
  });
});
