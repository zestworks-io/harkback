import { THRESHOLDS, type State } from "@harkback/core";
import type { Domain, Rel } from "@harkback/spec";
import { understandingOf, type Understanding } from "./concept-detail";

export interface GraphNode {
  id: string;
  name: string;
  /** False for a concept that is only mentioned (a prerequisite or variant nobody has explained yet). */
  studied: boolean;
  understanding: Understanding;
  /** How many relations it has in the graph. */
  degree: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  rel: Rel;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export interface GraphOptions {
  /** Show only concepts whose name contains this, and the ones they connect to. */
  query?: string;
  /** Show only studied concepts in this field, and the ones they connect to. */
  domain?: Domain;
  /** Show only studied concepts you understand this well, and the ones they connect to. */
  understanding?: Understanding;
  /** Show only studied concepts you last looked up at or after this time (ms), and the ones they connect to. */
  since?: number;
  /** The most concepts to draw; the best connected ones are kept. */
  limit?: number;
  width?: number;
  height?: number;
}

/** The concepts and relations to draw: no placeholders without a relation, no rejected or weak proposals. */
export function graphModel(state: State, o: GraphOptions = {}): Omit<Graph, "width" | "height"> {
  const limit = o.limit ?? 150;
  const q = (o.query ?? "").trim().toLowerCase();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  for (const e of state.edges.values()) {
    if (e.status === "rejected" || (e.status !== "confirmed" && e.confidence < THRESHOLDS.relatedEdgeConfidence)) continue;
    if (!state.concepts.has(e.from) || !state.concepts.has(e.to) || e.from === e.to) continue;
    edges.push({ id: e.id, from: e.from, to: e.to, rel: e.rel });
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const matches = (id: string): boolean => !q || state.concepts.get(id)!.names.some((n) => n.toLowerCase().includes(q));
  const lastLookup = (id: string): number => {
    const last = state.encountersByConcept.get(id)?.at(-1);
    return (last && state.encounters.get(last)?.createdAt) || 0;
  };
  const filtering = o.domain !== undefined || o.understanding !== undefined || o.since !== undefined;
  // Only a concept that was studied has a field, an understanding and a last look-up to filter on.
  const passes = (id: string): boolean => {
    if (!filtering) return true;
    const c = state.concepts.get(id)!;
    return (
      !c.isPlaceholder &&
      (o.domain === undefined || c.domain === o.domain) &&
      (o.understanding === undefined || understandingOf(state, id) === o.understanding) &&
      (o.since === undefined || lastLookup(id) >= o.since)
    );
  };
  let ids = [...state.concepts.values()].filter((c) => !c.isPlaceholder || degree.has(c.id)).map((c) => c.id);
  if (q || filtering) {
    const direct = new Set(ids.filter((id) => matches(id) && passes(id)));
    const hit = new Set(direct);
    for (const e of edges) {
      if (direct.has(e.from)) hit.add(e.to);
      if (direct.has(e.to)) hit.add(e.from);
    }
    ids = ids.filter((id) => hit.has(id));
  }
  ids.sort(
    (a, b) =>
      (degree.get(b) ?? 0) - (degree.get(a) ?? 0) ||
      state.concepts.get(a)!.canonicalName.localeCompare(state.concepts.get(b)!.canonicalName, "en") ||
      (a < b ? -1 : 1),
  );
  const keep = new Set(ids.slice(0, limit));
  const kept = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const shown = new Map<string, number>();
  for (const e of kept) {
    shown.set(e.from, (shown.get(e.from) ?? 0) + 1);
    shown.set(e.to, (shown.get(e.to) ?? 0) + 1);
  }
  return {
    nodes: [...keep].map((id) => {
      const c = state.concepts.get(id)!;
      return {
        id,
        name: c.canonicalName,
        studied: !c.isPlaceholder,
        understanding: understandingOf(state, id),
        degree: shown.get(id) ?? 0,
        x: 0,
        y: 0,
      };
    }),
    edges: kept,
  };
}

/** A small deterministic force layout: relations pull, every pair pushes apart, the middle holds the whole together. */
export function layoutGraph(model: Omit<Graph, "width" | "height">, width = 900, height = 600, rounds = 220): Graph {
  const nodes = model.nodes.map((n) => ({ ...n }));
  const n = nodes.length;
  if (n === 0) return { nodes, edges: model.edges, width, height };
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const cx = width / 2;
  const cy = height / 2;
  // Start on a circle in a fixed order, so the same records always give the same picture.
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    const r = Math.min(width, height) * 0.35;
    node.x = cx + r * Math.cos(angle);
    node.y = cy + r * Math.sin(angle);
  });
  const ideal = Math.max(40, Math.min(110, Math.sqrt((width * height) / n) * 0.7));
  const links = model.edges.flatMap((e) => (index.has(e.from) && index.has(e.to) ? [[index.get(e.from)!, index.get(e.to)!] as const] : []));
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let round = 0; round < rounds; round++) {
    const cooling = 1 - round / rounds;
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = nodes[i]!.x - nodes[j]!.x;
        let vy = nodes[i]!.y - nodes[j]!.y;
        let d = Math.hypot(vx, vy);
        if (d < 0.01) {
          // Two nodes on one spot: separate them in a fixed direction.
          vx = 1;
          vy = 0;
          d = 1;
        }
        const push = (ideal * ideal) / d;
        const fx = (vx / d) * push;
        const fy = (vy / d) * push;
        dx[i]! += fx;
        dy[i]! += fy;
        dx[j]! -= fx;
        dy[j]! -= fy;
      }
    }
    for (const [a, b] of links) {
      const vx = nodes[a]!.x - nodes[b]!.x;
      const vy = nodes[a]!.y - nodes[b]!.y;
      const d = Math.max(0.01, Math.hypot(vx, vy));
      const pull = (d * d) / ideal;
      dx[a]! -= (vx / d) * pull;
      dy[a]! -= (vy / d) * pull;
      dx[b]! += (vx / d) * pull;
      dy[b]! += (vy / d) * pull;
    }
    const step = Math.max(2, ideal * 0.5) * cooling;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      dx[i]! += (cx - node.x) * 0.05;
      dy[i]! += (cy - node.y) * 0.05;
      const d = Math.max(0.01, Math.hypot(dx[i]!, dy[i]!));
      const move = Math.min(d, step);
      node.x += (dx[i]! / d) * move;
      node.y += (dy[i]! / d) * move;
    }
  }
  // Fit into the frame with a margin, whatever the forces made of it.
  const margin = 50;
  const xs = nodes.map((p) => p.x);
  const ys = nodes.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((width - 2 * margin) / Math.max(1, x1 - x0), (height - 2 * margin) / Math.max(1, y1 - y0), 3);
  for (const p of nodes) {
    p.x = width / 2 + (p.x - (x0 + x1) / 2) * scale;
    p.y = height / 2 + (p.y - (y0 + y1) / 2) * scale;
  }
  return { nodes, edges: model.edges, width, height };
}

export function buildGraph(state: State, o: GraphOptions = {}): Graph {
  return layoutGraph(graphModel(state, o), o.width, o.height);
}
