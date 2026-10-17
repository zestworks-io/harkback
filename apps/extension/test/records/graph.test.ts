import { describe, expect, it } from "vitest";
import { buildGraph, graphModel, layoutGraph, shortLabel, type GraphNode } from "../../src/lib/records/graph";
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

  it("can leave out the concepts nobody has explained yet, with their relations", () => {
    const { w, ids } = build();
    const m = graphModel(w.state(), { unexplained: false });
    expect(m.nodes.some((n) => n.id === ids.peft)).toBe(false);
    expect(m.edges.some((e) => e.to === ids.peft)).toBe(false);
    expect(m.edges).toHaveLength(2);
  });

  it("shows the name it is given for each concept", () => {
    const { w, ids } = build();
    const m = graphModel(w.state(), { nameOf: (id) => (id === ids.lora ? "低秩适配" : "x") });
    expect(m.nodes.find((n) => n.id === ids.lora)!.name).toBe("低秩适配");
  });
});

const node = (id: string, name: string, degree: number, studied = true) => ({ id, name, studied, understanding: "new" as const, degree });

describe("layoutGraph", () => {
  it("is deterministic, finite and inside the frame", () => {
    const { w } = build();
    const a = buildGraph(w.state(), { width: 800, height: 500 });
    const b = buildGraph(w.state(), { width: 800, height: 500 });
    expect(a).toEqual(b);
    expect(a.width).toBeGreaterThanOrEqual(800);
    expect(a.width / a.height).toBeCloseTo(800 / 500);
    for (const n of a.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(n.x - n.r).toBeGreaterThanOrEqual(0);
      expect(n.x + n.r).toBeLessThanOrEqual(a.width);
      expect(n.y - n.r).toBeGreaterThanOrEqual(0);
      expect(n.y + n.r).toBeLessThanOrEqual(a.height);
    }
  });

  it("keeps groups with no relation between them near each other, at full size", () => {
    // Twelve pairs that share nothing: the old layout pushed them to the corners and shrank each pair to a dot.
    const nodes = Array.from({ length: 24 }, (_, i) => node(`n${String(i).padStart(2, "0")}`, `Concept ${i}`, 1));
    const edges = Array.from({ length: 12 }, (_, i) => ({
      id: `e${i}`,
      from: nodes[2 * i]!.id,
      to: nodes[2 * i + 1]!.id,
      rel: "related" as const,
    }));
    const g = layoutGraph({ nodes, edges }, 960, 640);
    const at = new Map(g.nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const d = Math.hypot(at.get(e.from)!.x - at.get(e.to)!.x, at.get(e.from)!.y - at.get(e.to)!.y);
      expect(d).toBeGreaterThan(30);
      expect(d).toBeLessThan(400);
    }
    // The pairs fill the frame instead of leaving most of it empty.
    const xs = g.nodes.map((n) => n.x);
    const ys = g.nodes.map((n) => n.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(g.width * 0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(g.height * 0.4);
  });

  it("places the labels it shows inside the frame, clear of each other and of the circles", () => {
    const nodes = Array.from({ length: 40 }, (_, i) =>
      node(`n${String(i).padStart(2, "0")}`, i % 3 ? `machine translation metric ${i}` : `机器翻译评估指标${i}`, 3, i % 2 === 0),
    );
    const edges = nodes.slice(1).map((n, i) => ({ id: `e${i}`, from: nodes[i % 8]!.id, to: n.id, rel: "prerequisite" as const }));
    const g = layoutGraph({ nodes, edges }, 960, 640);
    const box = (n: GraphNode) => {
      const w = [...n.label].reduce((sum, ch) => sum + (ch.codePointAt(0)! >= 0x2e80 ? 12 : 7.2), 0);
      const x0 = n.labelAnchor === "start" ? n.labelX : n.labelAnchor === "end" ? n.labelX - w : n.labelX - w / 2;
      return { x0, x1: x0 + w, y0: n.labelY - 12, y1: n.labelY };
    };
    const shown = g.nodes.filter((n) => n.labelShown);
    expect(shown.length).toBeGreaterThan(nodes.length * 0.8);
    for (const n of shown) {
      const b = box(n);
      expect(b.x0).toBeGreaterThanOrEqual(-0.5);
      expect(b.x1).toBeLessThanOrEqual(g.width + 0.5);
    }
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++) {
        const a = box(shown[i]!);
        const b = box(shown[j]!);
        const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
        expect(apart, `${shown[i]!.label} / ${shown[j]!.label}`).toBe(true);
      }
  });

  it("shortens long names and draws concepts nobody has explained yet smaller", () => {
    expect(shortLabel("short")).toBe("short");
    expect([...shortLabel("Recall-Oriented Understudy for Gisting Evaluation")]).toHaveLength(28);
    expect(shortLabel("Recall-Oriented Understudy for Gisting Evaluation").endsWith("…")).toBe(true);
    const g = layoutGraph({ nodes: [node("a", "A", 2, true), node("b", "B", 2, false)], edges: [] });
    expect(g.nodes[1]!.r).toBeLessThan(g.nodes[0]!.r);
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
    const one = layoutGraph({ nodes: [node("a", "A", 0)], edges: [] }, 400, 300);
    expect(one.nodes[0]).toMatchObject({ x: 200, y: 150 });
    const same = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`,
      name: `N${i}`,
      studied: true,
      understanding: "new" as const,
      degree: 0,
    }));
    for (const n of layoutGraph({ nodes: same, edges: [] }).nodes) expect(Number.isFinite(n.x)).toBe(true);
  });
});
