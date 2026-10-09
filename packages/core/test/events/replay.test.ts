import { describe, expect, it } from "vitest";
import { edgeId, replay } from "../../src";
import { action, concept, encounter, ev, id } from "../helpers";

describe("replay: encounters", () => {
  it("redirects encounters of merged concepts to the representative", () => {
    const s = replay([
      concept(1, "LoRA"),
      concept(2, "Low-Rank Adaptation"),
      ev("concept.merged", { from: id(2), into: id(1) }),
      encounter(10, 2, "arxiv:1"),
    ]);
    expect(s.encounters.get(id(10))?.conceptId).toBe(id(1));
    expect(s.encountersByConcept.get(id(1))).toEqual([id(10)]);
  });

  it("drops deleted encounters and their actions", () => {
    const s = replay([
      concept(1, "LoRA"),
      encounter(10, 1, "arxiv:1"),
      action(10, "marked_confused"),
      ev("encounter.deleted", { encounter_id: id(10) }),
    ]);
    expect(s.encounters.size).toBe(0);
    expect(s.concepts.get(id(1))?.isPlaceholder).toBe(true);
  });

  it("tracks last action, last touch and confusion", () => {
    const s = replay([
      concept(1, "LoRA"),
      encounter(10, 1, "arxiv:1", "2026-09-10T00:00:00Z"),
      action(10, "marked_confused", "2026-09-11T00:00:00Z"),
      action(10, "marked_understood", "2026-09-12T00:00:00Z"),
    ]);
    const e = s.encounters.get(id(10))!;
    expect(e.lastAction).toBe("marked_understood");
    expect(e.everConfused).toBe(true);
    expect(e.lastTouchedAt).toBe(Date.parse("2026-09-12T00:00:00Z"));
  });

  it("warns about encounters that reference unknown concepts", () => {
    const s = replay([encounter(10, 99, "arxiv:1")]);
    expect(s.encounters.size).toBe(0);
    expect(s.warnings).toHaveLength(1);
  });
});

describe("replay: placeholders, mutes and sources", () => {
  it("derives placeholder state only from encounters", () => {
    const withoutEncounter = replay([concept(1, "QLoRA")]);
    expect(withoutEncounter.concepts.get(id(1))?.isPlaceholder).toBe(true);
    const withEncounter = replay([concept(1, "QLoRA"), encounter(10, 1, "arxiv:1")]);
    expect(withEncounter.concepts.get(id(1))?.isPlaceholder).toBe(false);
  });

  it("applies mute and unmute in time order", () => {
    const s = replay([
      concept(1, "LoRA"),
      ev("concept.muted", { concept_id: id(1) }, { ts: "2026-09-02T00:00:00Z" }),
      ev("concept.unmuted", { concept_id: id(1) }, { ts: "2026-09-03T00:00:00Z" }),
    ]);
    expect(s.concepts.get(id(1))?.muted).toBe(false);
  });

  it("merges source ids and keeps the latest sensitivity", () => {
    const s = replay([
      ev(
        "source.seen",
        { source_id: "arxiv:1", ids: { arxiv: "1" }, title: "Paper", license: "unknown", sensitivity: "normal" },
        { ts: "2026-09-01T00:00:00Z" },
      ),
      ev(
        "source.seen",
        { source_id: "arxiv:1", ids: { url: "https://arxiv.org/html/1" }, title: "Paper", license: "unknown", sensitivity: "sensitive" },
        { ts: "2026-09-02T00:00:00Z" },
      ),
    ]);
    expect(s.sources.get("arxiv:1")).toEqual({
      id: "arxiv:1",
      ids: { arxiv: "1", url: "https://arxiv.org/html/1" },
      title: "Paper",
      license: "unknown",
      sensitivity: "sensitive",
    });
  });
});

describe("replay: edges", () => {
  it("re-keys edges after a merge, dedupes them and carries status over", () => {
    const s = replay([
      concept(1, "LoRA"),
      concept(2, "Low-Rank Adaptation"),
      concept(3, "QLoRA"),
      ev(
        "edge.proposed",
        { from: id(3), to: id(2), rel: "variant_of", source: "llm_explain", confidence: 0.6, evidence: {} },
        { ts: "2026-09-02T00:00:00Z" },
      ),
      ev("edge.confirmed", { edge_id: edgeId(id(3), "variant_of", id(2)) }, { ts: "2026-09-03T00:00:00Z" }),
      ev(
        "edge.proposed",
        { from: id(3), to: id(1), rel: "variant_of", source: "user", confidence: 0.8, evidence: {} },
        { ts: "2026-09-04T00:00:00Z" },
      ),
      ev("concept.merged", { from: id(2), into: id(1) }, { ts: "2026-09-05T00:00:00Z" }),
    ]);
    expect([...s.edges.keys()]).toEqual([edgeId(id(3), "variant_of", id(1))]);
    const edge = s.edges.get(edgeId(id(3), "variant_of", id(1)))!;
    expect(edge.status).toBe("confirmed");
    expect(edge.confidence).toBe(0.8);
    expect(edge.sources.sort()).toEqual(["llm_explain", "user"]);
  });

  it("drops edges that become self-loops", () => {
    const s = replay([
      concept(1, "LoRA"),
      concept(2, "Low-Rank Adaptation"),
      ev("edge.proposed", { from: id(1), to: id(2), rel: "related", source: "cooccurrence", confidence: 0.3, evidence: {} }),
      ev("concept.merged", { from: id(2), into: id(1) }),
    ]);
    expect(s.edges.size).toBe(0);
  });
});
