import { describe, expect, it } from "vitest";
import {
  buildGraph,
  crosses,
  edgeSegments,
  graphModel,
  layoutGraph,
  placeLabels,
  shortLabel,
  type GraphNode,
} from "../../src/lib/records/graph";
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

const node = (id: string, name: string, degree: number, studied = true) => ({
  id,
  name,
  studied,
  explained: studied,
  understanding: "new" as const,
  degree,
});

describe("layoutGraph", () => {
  it("curls a long chain of relations up instead of drawing it as one straight line", () => {
    const n = 40;
    const g = layoutGraph({
      nodes: Array.from({ length: n }, (_, i) => ({
        id: `c${i}`,
        name: `C${i}`,
        studied: true,
        explained: true,
        understanding: "new" as const,
        degree: i === 0 || i === n - 1 ? 1 : 2,
      })),
      edges: Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i}`, from: `c${i}`, to: `c${i + 1}`, rel: "prerequisite" as const })),
    });
    const span = (k: "x" | "y") => Math.max(...g.nodes.map((p) => p[k])) - Math.min(...g.nodes.map((p) => p[k]));
    expect(Math.min(span("x"), span("y")) / Math.max(span("x"), span("y"))).toBeGreaterThan(0.4);
  });

  it("draws a pair and a short chain of relations level", () => {
    for (const n of [2, 4]) {
      const g = layoutGraph({
        nodes: Array.from({ length: n }, (_, i) => node(`c${i}`, `C${i}`, i === 0 || i === n - 1 ? 1 : 2)),
        edges: Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i}`, from: `c${i}`, to: `c${i + 1}`, rel: "related" as const })),
      });
      const ys = g.nodes.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
    }
  });

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
      explained: true,
      understanding: "new" as const,
      degree: 0,
    }));
    for (const n of layoutGraph({ nodes: same, edges: [] }).nodes) expect(Number.isFinite(n.x)).toBe(true);
  });

  it("places fewer labels when they are drawn larger on the map, and keeps them off the lines where it can", () => {
    const nodes = Array.from({ length: 30 }, (_, i) => node(`n${String(i).padStart(2, "0")}`, `concept number ${i}`, 2));
    const edges = nodes.slice(1).map((n, i) => ({ id: `e${i}`, from: nodes[i % 5]!.id, to: n.id, rel: "related" as const }));
    const g = layoutGraph({ nodes, edges }, 960, 640);
    const frame = { x0: 0, y0: 0, x1: g.width, y1: g.height };
    const segments = edgeSegments(g.nodes, g.edges);
    const shownAt = (scale: number) => {
      const copy = g.nodes.map((n) => ({ ...n }));
      placeLabels(copy, frame, scale, segments);
      return copy.filter((n) => n.labelShown).length;
    };
    expect(shownAt(2.5)).toBeLessThan(shownAt(1));
    expect(shownAt(0.5)).toBeGreaterThanOrEqual(shownAt(1));
  });

  it("shows every label when asked to, and keeps labels off the circles behind where it can", () => {
    const placed = (label: string, x: number) => ({
      ...node(label, label, 1),
      x,
      y: 50,
      r: 6,
      label,
      labelX: 0,
      labelY: 0,
      labelAnchor: "middle" as const,
      labelShown: false,
    });
    // A frame with room only beside the circles, and three circles in a row: the middle one has no free place.
    const frame = { x0: 0, y0: 30, x1: 400, y1: 70 };
    const crowded = () => [placed("first", 160), placed("middle", 200), placed("last", 240)];
    const usual = crowded();
    placeLabels(usual, frame);
    expect(usual.filter((n) => n.labelShown).map((n) => n.id)).toEqual(["first", "last"]);
    const always = crowded();
    placeLabels(always, frame, 1, [], { always: true });
    expect(always.every((n) => n.labelShown)).toBe(true);
    // A faded circle right above a lone concept: its name goes elsewhere rather than over it.
    const lone = [placed("x", 100)];
    placeLabels(lone, { x0: 0, y0: 0, x1: 200, y1: 100 }, 1, [], { others: [{ x: 100, y: 30, r: 8 }] });
    expect(lone[0]!.labelShown).toBe(true);
    expect(lone[0]!.labelY).toBeGreaterThan(50);
    // At the right edge of the part in view, with faded circles above and below: shown on the left, not past the edge.
    const fenced = {
      others: [
        { x: 190, y: 30, r: 8 },
        { x: 190, y: 70, r: 8 },
      ],
      always: true,
    };
    const edge = [placed("x", 190)];
    placeLabels(edge, { x0: 0, y0: 0, x1: 200, y1: 100 }, 1, [], fenced);
    expect(edge[0]!.labelAnchor).toBe("end");
    expect(edge[0]!.labelX).toBeLessThan(190);
    // The same concept with room to its right takes the right.
    const open = [placed("x", 190)];
    placeLabels(open, { x0: 0, y0: 0, x1: 400, y1: 100 }, 1, [], fenced);
    expect(open[0]!.labelAnchor).toBe("start");
  });

  it("tells whether a line passes through a box", () => {
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(crosses({ x1: -5, y1: 5, x2: 15, y2: 5 }, box)).toBe(true);
    expect(crosses({ x1: 2, y1: 2, x2: 3, y2: 3 }, box)).toBe(true);
    expect(crosses({ x1: -5, y1: -5, x2: -1, y2: 20 }, box)).toBe(false);
    expect(crosses({ x1: 11, y1: 0, x2: 20, y2: 10 }, box)).toBe(false);
  });

  it("draws a term only highlighted in Zotero as not explained yet, and hides it with the others", () => {
    const w = world();
    w.source("s1");
    const imported = w.concept("Imported only");
    w.encounter(imported, "s1", "");
    const known = w.concept("Explained");
    w.encounter(known, "s1");
    const shown = graphModel(w.state()).nodes.find((n) => n.id === imported)!;
    expect(shown).toMatchObject({ studied: true, explained: false });
    expect(graphModel(w.state(), { unexplained: false }).nodes.map((n) => n.id)).toEqual([known]);
  });
});
