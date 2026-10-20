import { describe, expect, it } from "vitest";
import type { HarkEvent } from "@harkback/spec";
import { createEventFactory, edgeId, planSplit, replay } from "../../src";
import { concept, encounter, ev, id } from "../helpers";

const NEW = id(500);

function apply(events: HarkEvent[], plan: ReturnType<typeof planSplit>): HarkEvent[] {
  if (!plan.ok) throw new Error(plan.reason);
  let seq = 0;
  return [
    ...events,
    ...plan.build(createEventFactory({ device: "dev_bbbb", nextSeq: () => ++seq, now: () => Date.parse("2026-10-01T00:00:00Z") })),
  ];
}

/** "Prompt tuning" looked up and joined to "prefix tuning" by mistake: its name became an alias. */
function wrongJoin(): HarkEvent[] {
  return [
    ev("source.seen", { source_id: "s1", ids: {}, title: "S", license: "unknown", sensitivity: "normal" }),
    concept(1, "Prefix tuning"),
    encounter(10, 1, "s1", "2026-09-10T00:00:00Z"),
    ev("concept.alias_added", { concept_id: id(1), alias: "Prompt tuning" }, { ts: "2026-09-11T00:00:00Z" }),
    encounter(11, 1, "s1", "2026-09-11T00:00:00Z"),
    concept(2, "Soft prompt", "ml", [], "2026-09-11T00:00:00Z"),
    ev(
      "edge.proposed",
      { from: id(1), to: id(2), rel: "prerequisite", source: "llm_explain", confidence: 0.9, evidence: { encounter_id: id(11) } },
      { ts: "2026-09-11T00:00:00Z" },
    ),
    ev(
      "concept.alias_proposed",
      { concept_id: id(1), alias: "提示调优", language: "zh", source: "llm_explain", evidence: { encounter_id: id(11) } },
      { ts: "2026-09-11T00:00:00Z" },
    ),
  ];
}

describe("planSplit", () => {
  it("moves the entries and the name to a new concept, which stays apart", () => {
    const events = wrongJoin();
    const state = replay(
      apply(
        events,
        planSplit(events, { conceptId: id(1), encounterIds: [id(11)], names: ["Prompt tuning"], newName: "Prompt tuning" }, NEW),
      ),
    );
    expect(state.representative.get(NEW)).toBe(NEW);
    expect(state.concepts.get(id(1))!.names).toEqual(["Prefix tuning"]);
    expect(state.concepts.get(NEW)!.names).toEqual(["Prompt tuning"]);
    expect(state.encountersByConcept.get(id(1))).toEqual([id(10)]);
    expect(state.encountersByConcept.get(NEW)).toEqual([id(11)]);
  });

  it("takes the relations and suggested names found with a moved entry along", () => {
    const events = wrongJoin();
    const state = replay(
      apply(
        events,
        planSplit(events, { conceptId: id(1), encounterIds: [id(11)], names: ["Prompt tuning"], newName: "Prompt tuning" }, NEW),
      ),
    );
    expect([...state.edges.keys()]).toEqual([edgeId(NEW, "prerequisite", id(2))]);
    expect(state.concepts.get(NEW)!.proposedAliases).toEqual(["提示调优"]);
    expect(state.concepts.get(id(1))!.proposedAliases).toEqual([]);
  });

  it("refuses when a name both would still share joins them again", () => {
    const events = wrongJoin();
    expect(planSplit(events, { conceptId: id(1), encounterIds: [id(11)], names: [], newName: "Prompt tuning" }, NEW)).toEqual({
      ok: false,
      reason: "rejoins",
    });
  });

  it("refuses what does not belong to the concept, its own name, and an empty split", () => {
    const events = wrongJoin();
    const plan = (o: Partial<Parameters<typeof planSplit>[1]>) =>
      planSplit(events, { conceptId: id(1), encounterIds: [], names: [], newName: "X", ...o }, NEW);
    expect(plan({ encounterIds: [id(99)] })).toEqual({ ok: false, reason: "invalid" });
    expect(plan({ names: ["Prefix tuning"] })).toEqual({ ok: false, reason: "invalid" });
    expect(plan({ names: ["Soft prompt"] })).toEqual({ ok: false, reason: "invalid" });
    expect(plan({})).toEqual({ ok: false, reason: "invalid" });
    expect(plan({ encounterIds: [id(10)], newName: "  " })).toEqual({ ok: false, reason: "invalid" });
  });

  it("undoes a merge when the name moved is the merged concept's own name", () => {
    const events = [
      ...wrongJoin(),
      concept(3, "P-tuning", "ml", [], "2026-09-12T00:00:00Z"),
      encounter(12, 3, "s1", "2026-09-12T00:00:00Z"),
      ev("concept.merged", { from: id(3), into: id(1) }, { ts: "2026-09-13T00:00:00Z" }),
    ];
    expect(replay(events).representative.get(id(3))).toBe(id(1));
    const state = replay(
      apply(events, planSplit(events, { conceptId: id(1), encounterIds: [], names: ["P-tuning"], newName: "P-tuning" }, NEW)),
    );
    expect(state.representative.get(id(3))).not.toBe(id(1));
    expect(state.representative.get(id(3))).toBe(state.representative.get(NEW));
    expect(state.encountersByConcept.get(state.representative.get(NEW)!)).toEqual([id(12)]);
  });

  it("keeps a concept merged in through the one that moves, unless its own name moves too", () => {
    const events = [
      ...wrongJoin(),
      concept(3, "P-tuning", "ml", [], "2026-09-12T00:00:00Z"),
      concept(4, "Prompt learning", "ml", [], "2026-09-12T00:00:00Z"),
      encounter(13, 4, "s1", "2026-09-12T00:00:00Z"),
      ev("concept.merged", { from: id(4), into: id(3) }, { ts: "2026-09-13T00:00:00Z" }),
      ev("concept.merged", { from: id(3), into: id(1) }, { ts: "2026-09-14T00:00:00Z" }),
    ];
    const split = (names: string[]) =>
      replay(apply(events, planSplit(events, { conceptId: id(1), encounterIds: [], names, newName: "P-tuning" }, NEW)));
    const one = split(["P-tuning"]);
    expect(one.representative.get(id(4))).toBe(one.representative.get(id(1)));
    expect(one.representative.get(id(3))).toBe(one.representative.get(NEW));
    expect(one.representative.get(NEW)).not.toBe(one.representative.get(id(1)));
    const both = split(["P-tuning", "Prompt learning"]);
    expect(both.representative.get(id(4))).toBe(both.representative.get(NEW));
  });

  it("adds no merge for a concept joined by a name they share", () => {
    const events = [...wrongJoin(), concept(3, "Prefix-tuning", "ml", ["Prefix tuning"], "2026-09-12T00:00:00Z")];
    expect(replay(events).representative.get(id(3))).toBe(replay(events).representative.get(id(1)));
    const after = apply(
      events,
      planSplit(events, { conceptId: id(1), encounterIds: [id(11)], names: ["Prompt tuning"], newName: "Prompt tuning" }, NEW),
    );
    expect(after.slice(events.length).filter((e) => e.type === "concept.merged")).toEqual([]);
    const state = replay(after);
    expect(state.representative.get(id(3))).toBe(state.representative.get(id(1)));
  });

  it("joins an existing concept when the new name is already one", () => {
    const events = wrongJoin();
    const state = replay(
      apply(events, planSplit(events, { conceptId: id(1), encounterIds: [id(11)], names: ["Prompt tuning"], newName: "Soft prompt" }, NEW)),
    );
    expect(state.representative.get(NEW)).toBe(id(2));
    expect(state.encountersByConcept.get(id(2))).toEqual([id(11)]);
  });
});

describe("replaying name removals and unmerges", () => {
  it("lets a name added again after it was removed count again", () => {
    const state = replay([
      concept(1, "A", "ml", ["B"]),
      ev("concept.alias_removed", { concept_id: id(1), alias: "b" }, { ts: "2026-09-02T00:00:00Z" }),
      ev("concept.alias_added", { concept_id: id(1), alias: "B" }, { ts: "2026-09-03T00:00:00Z" }),
    ]);
    expect(state.concepts.get(id(1))!.names).toEqual(["A", "B"]);
  });

  it("lets a merge made again after an unmerge count", () => {
    const merged = ev("concept.merged", { from: id(2), into: id(1) }, { ts: "2026-09-02T00:00:00Z" });
    const unmerged = ev("concept.unmerged", { from: id(1), into: id(2) }, { ts: "2026-09-03T00:00:00Z" });
    const again = ev("concept.merged", { from: id(2), into: id(1) }, { ts: "2026-09-04T00:00:00Z" });
    const base = [concept(1, "A"), concept(2, "B")];
    expect(replay([...base, merged, unmerged]).representative.get(id(2))).toBe(id(2));
    expect(replay([...base, merged, unmerged, again]).representative.get(id(2))).toBe(id(1));
  });

  it("keeps a decision about a suggested name with the look-up it came from", () => {
    const events = [
      ...wrongJoin(),
      ev("concept.alias_confirmed", { concept_id: id(1), alias: "提示调优" }, { ts: "2026-09-12T00:00:00Z" }),
    ];
    expect(replay(events).concepts.get(id(1))!.names).toContain("提示调优");
    const state = replay(
      apply(
        events,
        planSplit(events, { conceptId: id(1), encounterIds: [id(11)], names: ["Prompt tuning"], newName: "Prompt tuning" }, NEW),
      ),
    );
    expect(state.concepts.get(NEW)!.names).toContain("提示调优");
    expect(state.concepts.get(NEW)!.proposedAliases).toEqual([]);
  });

  it("keeps a decision about a relation with the look-up it came from, but not one made after the move", () => {
    const old = edgeId(id(1), "prerequisite", id(2));
    const events = [...wrongJoin(), ev("edge.rejected", { edge_id: old }, { ts: "2026-09-12T00:00:00Z" })];
    const split = apply(
      events,
      planSplit(events, { conceptId: id(1), encounterIds: [id(11)], names: ["Prompt tuning"], newName: "Prompt tuning" }, NEW),
    );
    expect(replay(split).edges.get(edgeId(NEW, "prerequisite", id(2)))!.status).toBe("rejected");
    const later = [
      ...wrongJoin(),
      ...split.slice(wrongJoin().length + 1),
      ev("edge.confirmed", { edge_id: old }, { ts: "2026-10-02T00:00:00Z" }),
    ];
    expect(replay(later).edges.get(edgeId(NEW, "prerequisite", id(2)))!.status).toBe("proposed");
  });
});
