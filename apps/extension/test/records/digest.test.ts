import { describe, expect, it } from "vitest";
import { buildDigest, weekOf } from "../../src/lib/records/digest";
import { world } from "../helpers";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("weekOf", () => {
  it("runs from Monday to the next Monday in local time", () => {
    // 2026-10-07 is a Wednesday.
    const w = weekOf(at(2026, 10, 7));
    expect(new Date(w.start).getDay()).toBe(1);
    expect(w.start).toBe(at(2026, 10, 5, 0));
    expect(w.end).toBe(at(2026, 10, 12, 0));
  });

  it("puts Sunday in the week that started the Monday before and moves by whole weeks", () => {
    expect(weekOf(at(2026, 10, 11, 23)).start).toBe(at(2026, 10, 5, 0));
    expect(weekOf(at(2026, 10, 7), -1)).toEqual({ start: at(2026, 9, 28, 0), end: at(2026, 10, 5, 0) });
    expect(weekOf(at(2026, 10, 7), 1).start).toBe(at(2026, 10, 12, 0));
  });
});

function scenario() {
  const w = world(at(2026, 9, 29));
  w.source("s1", "normal", "Paper One");
  w.source("s2", "normal", "Blog Two");
  const lora = w.concept("LoRA");
  const qlora = w.concept("QLoRA");
  const rank = w.concept("Matrix rank");
  // Last week: LoRA.
  const loraFirst = w.encounter(lora, "s1");
  // This week (Mon 5 Oct to Sun 11 Oct): LoRA again, QLoRA and Matrix rank for the first time.
  w.setTime(at(2026, 10, 6));
  w.encounter(lora, "s2");
  w.setTime(at(2026, 10, 7));
  const q = w.encounter(qlora, "s2");
  w.setTime(at(2026, 10, 7, 13));
  w.encounter(rank, "s2");
  w.events.push(w.f.make("encounter.action", { encounter_id: q, action: "marked_confused" }));
  w.setTime(at(2026, 10, 9));
  w.events.push(w.f.make("encounter.action", { encounter_id: loraFirst, action: "marked_understood" }));
  w.events.push(
    w.f.make("edge.proposed", {
      from: qlora,
      to: lora,
      rel: "variant_of",
      source: "llm_explain",
      confidence: 0.9,
      evidence: { encounter_id: q },
    }),
  );
  // An older relation, supported by last week's look-up only.
  w.events.push(
    w.f.make("edge.proposed", {
      from: lora,
      to: rank,
      rel: "prerequisite",
      source: "llm_explain",
      confidence: 0.9,
      evidence: { encounter_id: loraFirst },
    }),
  );
  return { w, ids: { lora, qlora, rank }, q };
}

describe("buildDigest", () => {
  it("counts terms met this week, split into new and revisited, with the week before for comparison", () => {
    const { w } = scenario();
    const d = buildDigest(w.state(), weekOf(at(2026, 10, 7)));
    expect(d.met.map((c) => [c.name, c.fresh, c.lookups])).toEqual([
      ["Matrix rank", true, 1],
      ["QLoRA", true, 1],
      ["LoRA", false, 1],
    ]);
    expect(d.freshCount).toBe(2);
    expect(d.revisitedCount).toBe(1);
    expect(d.previousMet).toBe(1);
    expect(d.isEmpty).toBe(false);
  });

  it("counts answers, active days, busiest sources and still-confused terms", () => {
    const { w } = scenario();
    const d = buildDigest(w.state(), weekOf(at(2026, 10, 7)));
    expect(d.remembered).toBe(1);
    expect(d.confused).toBe(1);
    expect(d.activeDays).toBe(3);
    expect(d.sources).toEqual([{ sourceId: "s2", title: "Blog Two", lookups: 3 }]);
    expect(d.stillConfused.map((c) => c.name)).toEqual(["QLoRA"]);
  });

  it("lists relations whose first supporting look-up was this week and drops rejected ones", () => {
    const { w } = scenario();
    const week = weekOf(at(2026, 10, 7));
    const d = buildDigest(w.state(), week);
    expect(d.connections.map((c) => [c.from.name, c.rel, c.to.name])).toEqual([["QLoRA", "variant_of", "LoRA"]]);
    const edgeId = d.connections[0]!.edgeId;
    w.events.push(w.f.make("edge.rejected", { edge_id: edgeId }));
    expect(buildDigest(w.state(), week).connections).toEqual([]);
    expect(buildDigest(w.state(), weekOf(at(2026, 9, 30))).connections.map((c) => c.to.name)).toEqual(["Matrix rank"]);
  });

  it("counts the reunions shown this week and how many the reader used", () => {
    const { w, ids } = scenario();
    const shown = (conceptId: string, sourceId: string, t: number) => {
      w.setTime(t);
      w.events.push(w.f.make("reunion.shown", { concept_id: conceptId, source_id: sourceId }));
    };
    shown(ids.lora, "s2", at(2026, 10, 6));
    shown(ids.lora, "s3", at(2026, 10, 8));
    shown(ids.rank, "s3", at(2026, 10, 8));
    // Last week's, not counted.
    shown(ids.lora, "s4", at(2026, 10, 2));
    const week = weekOf(at(2026, 10, 7));
    expect(buildDigest(w.state(), week)).toMatchObject({ reunions: 3, reunionsUsed: 0 });
    // "I remember" and "Explain again" are uses; "Understood" on the same look-up is not.
    const lora = w.state().encountersByConcept.get(ids.lora)![0]!;
    w.setTime(at(2026, 10, 8, 14));
    w.events.push(w.f.make("encounter.action", { encounter_id: lora, action: "reunion_recalled" }));
    w.events.push(w.f.make("encounter.action", { encounter_id: lora, action: "reunion_reexplain" }));
    expect(buildDigest(w.state(), week)).toMatchObject({ reunions: 3, reunionsUsed: 2 });
  });

  it("counts a used reunion as shown in a week recorded before reunions shown were, and a week with only reunions is not empty", () => {
    const w = world(at(2026, 9, 29));
    w.source("s1");
    const lora = w.concept("LoRA");
    const e = w.encounter(lora, "s1");
    w.setTime(at(2026, 10, 6));
    w.events.push(w.f.make("encounter.action", { encounter_id: e, action: "reunion_recalled" }));
    w.events.push(w.f.make("encounter.action", { encounter_id: e, action: "reunion_compare" }));
    expect(buildDigest(w.state(), weekOf(at(2026, 10, 7)))).toMatchObject({ reunions: 2, reunionsUsed: 2, isEmpty: false });
    const v = world(at(2026, 9, 29));
    v.source("s1");
    const c = v.concept("LoRA");
    v.encounter(c, "s1");
    v.setTime(at(2026, 10, 6));
    v.events.push(v.f.make("reunion.shown", { concept_id: c, source_id: "s2" }));
    expect(buildDigest(v.state(), weekOf(at(2026, 10, 7)))).toMatchObject({ reunions: 1, isEmpty: false });
  });

  it("is empty for a week with nothing in it", () => {
    const { w } = scenario();
    const d = buildDigest(w.state(), weekOf(at(2026, 11, 2)));
    expect(d.isEmpty).toBe(true);
    expect(d.met).toEqual([]);
    expect(d.activeDays).toBe(0);
  });
});
