import { edgeId, ulid } from "@harkback/core";
import type { Action, Rel } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import { conceptDetail, understandingOf } from "../../src/lib/records/concept-detail";
import { world } from "../helpers";

function setup() {
  const w = world();
  w.source("s1", "normal", "Paper One");
  const act = (encounterId: string, action: Action) => w.events.push(w.f.make("encounter.action", { encounter_id: encounterId, action }));
  const edge = (from: string, rel: Rel, to: string, confidence = 0.9) =>
    w.events.push(w.f.make("edge.proposed", { from, to, rel, source: "llm_explain", confidence, evidence: {} }));
  return { w, act, edge };
}

describe("understandingOf", () => {
  it("is new without a decisive action", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    expect(understandingOf(w.state(), c)).toBe("new");
    act(e, "followed_up");
    act(e, "reunion_reexplain");
    act(e, "reunion_compare");
    expect(understandingOf(w.state(), c)).toBe("new");
  });

  it("follows the most recent decisive action", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "marked_confused");
    expect(understandingOf(w.state(), c)).toBe("confused");
    act(e, "marked_understood");
    expect(understandingOf(w.state(), c)).toBe("understood");
    act(e, "marked_confused");
    expect(understandingOf(w.state(), c)).toBe("confused");
  });

  it("calls a term answered Hard shaky, neither understood nor confused", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    act(w.encounter(c, "s1"), "review_hard");
    expect(understandingOf(w.state(), c)).toBe("shaky");
  });

  it("counts a recalled reunion as understood", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    act(w.encounter(c, "s1"), "reunion_recalled");
    expect(understandingOf(w.state(), c)).toBe("understood");
  });

  it("looks across all encounters of the concept", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const first = w.encounter(c, "s1");
    act(first, "marked_confused");
    w.setTime(Date.UTC(2026, 8, 5));
    const second = w.encounter(c, "s1");
    act(second, "marked_understood");
    expect(understandingOf(w.state(), c)).toBe("understood");
  });

  it("is new for an unknown concept", () => {
    expect(understandingOf(setup().w.state(), ulid())).toBe("new");
  });
});

describe("conceptDetail", () => {
  it("returns null for unknown concepts and placeholders", () => {
    const { w } = setup();
    const placeholder = w.concept("Ghost");
    expect(conceptDetail(w.state(), ulid())).toBeNull();
    expect(conceptDetail(w.state(), placeholder)).toBeNull();
  });

  it("reports whether the concept is muted", () => {
    const { w } = setup();
    const c = w.concept("LoRA");
    w.encounter(c, "s1");
    expect(conceptDetail(w.state(), c)!.muted).toBe(false);
    w.events.push(w.f.make("concept.muted", { concept_id: c }));
    expect(conceptDetail(w.state(), c)!.muted).toBe(true);
  });

  it("describes the concept and lists entries newest first", () => {
    const { w, act } = setup();
    const c = w.concept("Low-Rank Adaptation", ["LoRA"]);
    w.encounter(c, "s1", "older");
    w.setTime(Date.UTC(2026, 8, 9));
    const latest = w.encounter(c, "s1", "newer");
    act(latest, "marked_understood");
    const d = conceptDetail(w.state(), c)!;
    expect(d).toMatchObject({ conceptId: c, name: "Low-Rank Adaptation", aliases: ["LoRA"], domain: "ml", understanding: "understood" });
    expect(d.entries.map((e) => e.explanation)).toEqual(["newer", "older"]);
    expect(d.entries[0]).toMatchObject({ encounterId: latest, sourceTitle: "Paper One" });
  });

  it("groups relations by direction and marks unstudied targets", () => {
    const { w, edge } = setup();
    const lora = w.concept("LoRA");
    w.encounter(lora, "s1");
    const matrix = w.concept("Matrix rank");
    w.encounter(matrix, "s1");
    const ft = w.concept("Fine-tuning");
    w.encounter(ft, "s1");
    const qlora = w.concept("QLoRA");
    w.encounter(qlora, "s1");
    const peft = w.concept("PEFT");
    const dora = w.concept("DoRA");
    w.encounter(dora, "s1");
    edge(lora, "prerequisite", matrix);
    edge(lora, "prerequisite", peft);
    edge(lora, "variant_of", ft);
    edge(qlora, "variant_of", lora);
    edge(dora, "related", lora);
    edge(lora, "related", ft);
    const d = conceptDetail(w.state(), lora)!;
    expect(d.prerequisites).toEqual([
      { conceptId: matrix, name: "Matrix rank", aliases: [], studied: true, edgeId: edgeId(lora, "prerequisite", matrix) },
      { conceptId: peft, name: "PEFT", aliases: [], studied: false, edgeId: edgeId(lora, "prerequisite", peft) },
    ]);
    expect(d.variants.find((r) => r.name === "QLoRA")?.edgeId).toBe(edgeId(qlora, "variant_of", lora));
    expect(d.variants.map((r) => r.name).sort()).toEqual(["Fine-tuning", "QLoRA"]);
    expect(d.related.map((r) => r.name).sort()).toEqual(["DoRA", "Fine-tuning"]);
  });

  it("skips rejected and weak proposed edges but keeps confirmed weak ones", () => {
    const { w, edge } = setup();
    const c = w.concept("LoRA");
    w.encounter(c, "s1");
    const rejected = w.concept("A");
    const weak = w.concept("B");
    const weakConfirmed = w.concept("C");
    for (const x of [rejected, weak, weakConfirmed]) w.encounter(x, "s1");
    edge(c, "prerequisite", rejected);
    edge(c, "prerequisite", weak, 0.5);
    edge(c, "prerequisite", weakConfirmed, 0.5);
    w.events.push(w.f.make("edge.rejected", { edge_id: edgeId(c, "prerequisite", rejected) }));
    w.events.push(w.f.make("edge.confirmed", { edge_id: edgeId(c, "prerequisite", weakConfirmed) }));
    expect(conceptDetail(w.state(), c)!.prerequisites.map((r) => r.name)).toEqual(["C"]);
  });

  it("resolves merged concepts to one representative and never lists itself", () => {
    const { w, edge } = setup();
    const a = w.concept("Large Language Model");
    const b = w.concept("LLM");
    w.encounter(a, "s1");
    w.encounter(b, "s1");
    const dep = w.concept("Transformer");
    w.encounter(dep, "s1");
    edge(a, "prerequisite", dep);
    edge(b, "prerequisite", dep);
    edge(a, "related", b);
    w.events.push(w.f.make("concept.merged", { from: b, into: a }));
    const state = w.state();
    const rep = state.representative.get(b)!;
    const d = conceptDetail(state, b)!;
    expect(d.conceptId).toBe(rep);
    expect(d.entries).toHaveLength(2);
    expect(d.prerequisites).toHaveLength(1);
    expect(d.related).toHaveLength(0);
  });
});
