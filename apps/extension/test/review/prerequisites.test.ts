import { describe, expect, it } from "vitest";
import { prerequisiteMap } from "../../src/lib/review/prerequisites";
import { world } from "../helpers";

const T0 = Date.UTC(2026, 8, 1);

function setup() {
  const w = world(T0);
  const needs = (from: string, to: string, confidence: number) =>
    w.events.push(w.f.make("edge.proposed", { from, to, rel: "prerequisite", source: "llm_explain", confidence, evidence: {} }));
  const decide = (type: "edge.confirmed" | "edge.rejected", from: string, to: string) =>
    w.events.push(w.f.make(type, { edge_id: `${from}>prerequisite>${to}` }));
  return { w, needs, decide };
}

describe("prerequisiteMap", () => {
  it("keeps confirmed prerequisites and likely ones, and drops unlikely ones", () => {
    const { w, needs, decide } = setup();
    const lora = w.concept("LoRA");
    const rank = w.concept("Matrix rank");
    const svd = w.concept("SVD");
    const vectors = w.concept("Vector space");
    needs(lora, rank, 0.9);
    needs(lora, svd, 0.4);
    needs(lora, vectors, 0.4);
    decide("edge.confirmed", lora, vectors);
    expect(prerequisiteMap(w.state()).get(lora)).toEqual(new Set([rank, vectors]));
  });

  it("drops a likely prerequisite the reader rejected, even when it is proposed again afterwards", () => {
    const { w, needs, decide } = setup();
    const lora = w.concept("LoRA");
    const rank = w.concept("Matrix rank");
    needs(lora, rank, 0.9);
    decide("edge.rejected", lora, rank);
    needs(lora, rank, 0.95);
    expect(prerequisiteMap(w.state()).has(lora)).toBe(false);
  });
});
