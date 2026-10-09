import { describe, expect, it } from "vitest";
import { buildGraph, graphModel, layoutGraph } from "../../src/lib/records/graph";
import { world } from "../helpers";

function build() {
  const w = world();
  w.source("s1");
  const lora = w.concept("LoRA");
  const qlora = w.concept("QLoRA");
  const rank = w.concept("Matrix rank");
  const lonely = w.concept("Lonely");
  const peft = w.concept("PEFT");
  for (const c of [lora, qlora, rank, lonely]) w.encounter(c, "s1");
  const edge = (from: string, rel: "prerequisite" | "variant_of" | "related", to: string, confidence = 0.8) =>
    w.events.push(w.f.make("edge.proposed", { from, to, rel, source: "llm_explain", confidence, evidence: {} }));
  edge(qlora, "variant_of", lora);
  edge(lora, "prerequisite", rank);
  edge(lora, "prerequisite", peft);
  edge(lonely, "related", rank, 0.3);
  return { w, ids: { lora, qlora, rank, lonely, peft } };
}

describe("graphModel", () => {
  it("has the studied concepts and the ones they point to, and leaves out weak relations", () => {
    const { w, ids } = build();
    const m = graphModel(w.state());
    expect(m.nodes.map((n) => n.name).sort()).toEqual(["LoRA", "Lonely", "Matrix rank", "PEFT", "QLoRA"]);
    expect(m.nodes.find((n) => n.id === ids.peft)!.studied).toBe(false);
    expect(m.edges).toHaveLength(3);
    expect(m.nodes.find((n) => n.id === ids.lora)!.degree).toBe(3);
    expect(m.nodes.find((n) => n.id === ids.lonely)!.degree).toBe(0);
  });

  it("drops a rejected relation and filters by name keeping the neighbours", () => {
    const { w, ids } = build();
    const state = w.state();
    const edgeId = [...state.edges.values()].find((e) => e.to === ids.peft)!.id;
    w.events.push(w.f.make("edge.rejected", { edge_id: edgeId }));
    const after = graphModel(w.state());
    expect(after.edges).toHaveLength(2);
    expect(after.nodes.some((n) => n.id === ids.peft)).toBe(false);
    const q = graphModel(w.state(), { query: "qlora" });
    expect(q.nodes.map((n) => n.name).sort()).toEqual(["LoRA", "QLoRA"]);
  });

  it("filters by field, understanding and when a concept was last looked up, keeping the neighbours", () => {
    const { w, ids } = build();
    const state = w.state();
    const names = (o: Parameters<typeof graphModel>[1]) =>
      graphModel(w.state(), o)
        .nodes.map((n) => n.name)
        .sort();
    expect(state.concepts.get(ids.lora)!.domain).toBe("ml");
    expect(names({ domain: "ml" })).toEqual(["LoRA", "Lonely", "Matrix rank", "PEFT", "QLoRA"]);
    expect(names({ domain: "bio" })).toEqual([]);
    expect(names({ understanding: "confused" })).toEqual([]);
    w.events.push(w.f.make("encounter.action", { encounter_id: [...state.encounters.keys()][0]!, action: "marked_confused" }));
    expect(names({ understanding: "confused" }).length).toBeGreaterThan(0);
    const later = Date.UTC(2026, 9, 1);
    w.setTime(later);
    const fresh = w.concept("Fresh");
    w.encounter(fresh, "s1");
    expect(names({ since: later })).toEqual(["Fresh"]);
    expect(names({ since: later + 1 })).toEqual([]);
  });

  it("keeps the best connected concepts when there are too many", () => {
    const { w } = build();
    const m = graphModel(w.state(), { limit: 2 });
    expect(m.nodes).toHaveLength(2);
    expect(m.nodes[0]!.name).toBe("LoRA");
  });
});

describe("layoutGraph", () => {
  it("is deterministic, finite and inside the frame", () => {
    const { w } = build();
    const a = buildGraph(w.state(), { width: 800, height: 500 });
    const b = buildGraph(w.state(), { width: 800, height: 500 });
    expect(a).toEqual(b);
    for (const n of a.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(800);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(500);
    }
  });

  it("puts related concepts closer than unrelated ones, and keeps nodes apart", () => {
    const { w, ids } = build();
    const g = buildGraph(w.state());
    const at = (id: string) => g.nodes.find((n) => n.id === id)!;
    const dist = (a: string, b: string) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    expect(dist(ids.lora, ids.qlora)).toBeLessThan(dist(ids.qlora, ids.lonely));
    for (const a of g.nodes) for (const b of g.nodes) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
  });

  it("handles nothing, one node and nodes on the same spot", () => {
    expect(layoutGraph({ nodes: [], edges: [] }).nodes).toEqual([]);
    const one = layoutGraph(
      { nodes: [{ id: "a", name: "A", studied: true, understanding: "new", degree: 0, x: 0, y: 0 }], edges: [] },
      400,
      300,
    );
    expect(one.nodes[0]).toMatchObject({ x: 200, y: 150 });
    const same = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`,
      name: `N${i}`,
      studied: true,
      understanding: "new" as const,
      degree: 0,
      x: 0,
      y: 0,
    }));
    for (const n of layoutGraph({ nodes: same, edges: [] }).nodes) expect(Number.isFinite(n.x)).toBe(true);
  });
});
