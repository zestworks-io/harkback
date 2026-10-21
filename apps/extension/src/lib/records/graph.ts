import { THRESHOLDS, type State } from "@harkback/core";
import type { Domain, Rel } from "@harkback/spec";
import { isExplained, understandingOf, type Understanding } from "./concept-detail";

export interface GraphNode {
  id: string;
  name: string;
  /** False for a concept that is only mentioned (a prerequisite or variant nobody has explained yet). */
  studied: boolean;
  /** Whether any look-up of it has an explanation: a term only highlighted in Zotero has none yet. */
  explained: boolean;
  understanding: Understanding;
  /** How many relations it has in the graph. */
  degree: number;
  x: number;
  y: number;
  /** The circle's radius. */
  r: number;
  /** The name as drawn: long names are shortened. */
  label: string;
  /** Where the label goes, and whether it fits there without covering another label or circle. */
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "middle" | "end";
  labelShown: boolean;
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

/** A concept to draw, before it has a place. */
export type ModelNode = Pick<GraphNode, "id" | "name" | "studied" | "explained" | "understanding" | "degree">;

export interface GraphModel {
  nodes: ModelNode[];
  edges: GraphEdge[];
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
  /** False to leave out concepts nobody has explained yet. */
  unexplained?: boolean;
  /** The name to show for a concept; its canonical name by default. */
  nameOf?: (id: string) => string;
  width?: number;
  height?: number;
}

/** The concepts and relations to draw: no placeholders without a relation, no rejected or weak proposals. */
export function graphModel(state: State, o: GraphOptions = {}): GraphModel {
  const limit = o.limit ?? 150;
  const q = (o.query ?? "").trim().toLowerCase();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  const drawn = (id: string): boolean => {
    const c = state.concepts.get(id);
    return c !== undefined && (o.unexplained !== false || isExplained(state, id));
  };
  for (const e of state.edges.values()) {
    if (e.status === "rejected" || (e.status !== "confirmed" && e.confidence < THRESHOLDS.relatedEdgeConfidence)) continue;
    if (!drawn(e.from) || !drawn(e.to) || e.from === e.to) continue;
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
  let ids = [...state.concepts.values()].filter((c) => (!c.isPlaceholder || degree.has(c.id)) && drawn(c.id)).map((c) => c.id);
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
        name: o.nameOf?.(id) ?? c.canonicalName,
        studied: !c.isPlaceholder,
        explained: isExplained(state, id),
        understanding: understandingOf(state, id),
        degree: shown.get(id) ?? 0,
      };
    }),
    edges: kept,
  };
}

const IDEAL = 70;
// Groups stay further apart than two linked concepts, so they read as separate.
const GAP = IDEAL;
const MARGIN = 24;
const FONT = 12;
const LABEL_HEIGHT = FONT + 4;
const MAX_LABEL = 28;

/** The circle grows with the relations shown; a concept nobody has explained yet stays smaller. */
export function nodeRadius(studied: boolean, degree: number): number {
  return studied ? 6 + Math.min(degree, 6) * 1.5 : 4 + Math.min(degree, 6);
}

/** Long names are shortened, so one label cannot cross the whole map. */
export function shortLabel(name: string): string {
  const chars = [...name];
  return chars.length <= MAX_LABEL ? name : `${chars.slice(0, MAX_LABEL - 1).join("")}…`;
}

/** An estimate of the drawn width of a label: wide scripts (Han, kana, Hangul) take about a full em per character. */
export function labelWidth(label: string): number {
  let w = 0;
  for (const ch of label) w += ch.codePointAt(0)! >= 0x2e80 ? FONT : FONT * 0.6;
  return w;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The connected groups of nodes, largest first, each in the order the nodes were given. */
function components(n: number, links: readonly (readonly [number, number])[]): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (const [a, b] of links) parent[find(a)] = find(b);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length || a[0]! - b[0]!);
}

/** Relations pull, every pair pushes apart and the middle holds the group together; positions are relative to 0, 0. */
function forceLayout(points: { x: number; y: number; r: number }[], links: readonly (readonly [number, number])[], rounds: number): void {
  const n = points.length;
  if (n === 1) {
    points[0]!.x = 0;
    points[0]!.y = 0;
    return;
  }
  // Start on a circle in a fixed order, so the same records always give the same picture.
  const start = IDEAL * Math.max(1, Math.sqrt(n) * 0.6);
  points.forEach((p, i) => {
    const angle = (2 * Math.PI * i) / n;
    p.x = start * Math.cos(angle);
    p.y = start * Math.sin(angle);
  });
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let round = 0; round < rounds; round++) {
    const cooling = 1 - round / rounds;
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = points[i]!.x - points[j]!.x;
        let vy = points[i]!.y - points[j]!.y;
        let d = Math.hypot(vx, vy);
        if (d < 0.01) {
          // Two nodes on one spot: separate them in a fixed direction.
          vx = 1;
          vy = 0;
          d = 1;
        }
        const push = (IDEAL * IDEAL) / d;
        const fx = (vx / d) * push;
        const fy = (vy / d) * push;
        dx[i]! += fx;
        dy[i]! += fy;
        dx[j]! -= fx;
        dy[j]! -= fy;
      }
    }
    for (const [a, b] of links) {
      const vx = points[a]!.x - points[b]!.x;
      const vy = points[a]!.y - points[b]!.y;
      const d = Math.max(0.01, Math.hypot(vx, vy));
      const pull = (d * d) / IDEAL;
      dx[a]! -= (vx / d) * pull;
      dy[a]! -= (vy / d) * pull;
      dx[b]! += (vx / d) * pull;
      dy[b]! += (vy / d) * pull;
    }
    const step = IDEAL * 0.5 * cooling + 1;
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      dx[i]! -= p.x * 0.05;
      dy[i]! -= p.y * 0.05;
      const d = Math.max(0.01, Math.hypot(dx[i]!, dy[i]!));
      const move = Math.min(d, step);
      p.x += (dx[i]! / d) * move;
      p.y += (dy[i]! / d) * move;
    }
  }
  // Circles that still touch are moved apart, so each one can be seen and clicked.
  for (let round = 0; round < 100; round++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = points[i]!;
        const b = points[j]!;
        const min = a.r + b.r + LABEL_HEIGHT;
        let vx = a.x - b.x;
        let vy = a.y - b.y;
        let d = Math.hypot(vx, vy);
        if (d >= min) continue;
        if (d < 0.01) {
          vx = 1;
          vy = 0;
          d = 1;
        }
        const shift = (min - d) / 2;
        a.x += (vx / d) * shift;
        a.y += (vy / d) * shift;
        b.x -= (vx / d) * shift;
        b.y -= (vy / d) * shift;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** The box a label takes at one of four places around its circle, with text `scale` times its usual size. */
function labelBox(node: GraphNode, place: number, scale: number): { box: Box; x: number; y: number; anchor: GraphNode["labelAnchor"] } {
  const w = labelWidth(node.label) * scale;
  const font = FONT * scale;
  const tall = LABEL_HEIGHT * scale;
  const { x, y, r } = node;
  const pad = 4 * scale;
  switch (place) {
    case 0: // above
      return { x, y: y - r - pad, anchor: "middle", box: { x0: x - w / 2, y0: y - r - pad - tall, x1: x + w / 2, y1: y - r - pad } };
    case 1: // below
      return {
        x,
        y: y + r + pad + font,
        anchor: "middle",
        box: { x0: x - w / 2, y0: y + r + pad, x1: x + w / 2, y1: y + r + pad + tall },
      };
    case 2: // right
      return {
        x: x + r + pad,
        y: y + font / 3,
        anchor: "start",
        box: { x0: x + r + pad, y0: y - tall / 2, x1: x + r + pad + w, y1: y + tall / 2 },
      };
    default: // left
      return {
        x: x - r - pad,
        y: y + font / 3,
        anchor: "end",
        box: { x0: x - r - pad - w, y0: y - tall / 2, x1: x - r - pad, y1: y + tall / 2 },
      };
  }
}

/** A relation as drawn: a straight line between two circles. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The lines of a graph's relations, for labels to keep clear of. */
export function edgeSegments(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Segment[] {
  const at = new Map(nodes.map((n) => [n.id, n]));
  return edges.flatMap((e) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    return a && b ? [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }] : [];
  });
}

/** Whether a line passes through a box (Liang–Barsky clipping). */
export function crosses(s: Segment, b: Box): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, s.x1 - b.x0],
    [dx, b.x1 - s.x1],
    [-dy, s.y1 - b.y0],
    [dy, b.y1 - s.y1],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Places each label above, below, right or left of its circle, wherever it covers no circle and no label placed before,
 * preferring the place that crosses the fewest lines. Studied concepts and the best connected go first; a label with no
 * free place is shown only on hover. `scale` is the size the text is drawn at, in units of the map: zoomed out, labels take
 * more of the map and fewer of them fit.
 */
export function placeLabels(nodes: GraphNode[], frame: Box, scale = 1, segments: readonly Segment[] = []): void {
  const circles: Box[] = nodes.map((n) => ({ x0: n.x - n.r, y0: n.y - n.r, x1: n.x + n.r, y1: n.y + n.r }));
  const placed: Box[] = [];
  const order = nodes
    .map((_, i) => i)
    .sort((a, b) => Number(nodes[b]!.studied) - Number(nodes[a]!.studied) || nodes[b]!.degree - nodes[a]!.degree || a - b);
  for (const i of order) {
    const node = nodes[i]!;
    let chosen: ReturnType<typeof labelBox> | undefined;
    let fewest = Infinity;
    for (let place = 0; place < 4 && fewest > 0; place++) {
      const c = labelBox(node, place, scale);
      const inside = c.box.x0 >= frame.x0 && c.box.x1 <= frame.x1 && c.box.y0 >= frame.y0 && c.box.y1 <= frame.y1;
      const free = inside && !placed.some((b) => overlaps(b, c.box)) && !circles.some((b, j) => j !== i && overlaps(b, c.box));
      if (!free) continue;
      const crossed = segments.reduce((n, s) => n + Number(crosses(s, c.box)), 0);
      if (crossed < fewest) {
        fewest = crossed;
        chosen = c;
      }
    }
    const at = chosen ?? labelBox(node, 0, scale);
    node.labelX = at.x;
    node.labelY = at.y;
    node.labelAnchor = at.anchor;
    node.labelShown = chosen !== undefined;
    if (chosen) placed.push(chosen.box);
  }
}

/**
 * A deterministic layout. Each connected group is laid out on its own, so groups with no relation between them do not
 * fly apart, and the groups are then packed in rows. The frame grows to hold everything at full size rather than
 * shrinking the drawing, so labels never get crowded; the page scales the frame to fit.
 */
export function layoutGraph(model: GraphModel, width = 900, height = 600, rounds = 220): Graph {
  const nodes: GraphNode[] = model.nodes.map((n) => ({
    ...n,
    x: 0,
    y: 0,
    r: nodeRadius(n.studied, n.degree),
    label: shortLabel(n.name),
    labelX: 0,
    labelY: 0,
    labelAnchor: "middle",
    labelShown: true,
  }));
  if (nodes.length === 0) return { nodes, edges: model.edges, width, height };
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const links = model.edges.flatMap((e) => (index.has(e.from) && index.has(e.to) ? [[index.get(e.from)!, index.get(e.to)!] as const] : []));

  // Lay out each group around 0, 0 and measure it with its labels above the circles.
  const groups = components(nodes.length, links).map((members) => {
    const local = new Map(members.map((m, i) => [m, i]));
    const points = members.map((m) => nodes[m]!);
    const own = links.flatMap(([a, b]) => (local.has(a) ? [[local.get(a)!, local.get(b)!] as const] : []));
    forceLayout(points, own, rounds);
    const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of points) {
      const half = Math.max(p.r, labelWidth(p.label) / 2);
      box.x0 = Math.min(box.x0, p.x - half);
      box.x1 = Math.max(box.x1, p.x + half);
      box.y0 = Math.min(box.y0, p.y - p.r - LABEL_HEIGHT - 4);
      box.y1 = Math.max(box.y1, p.y + p.r + LABEL_HEIGHT + 4);
    }
    return { points, box, w: box.x1 - box.x0, h: box.y1 - box.y0 };
  });

  // Pack the groups in rows, trying each row width a row could end at, and keep the one that needs the smallest frame
  // of the requested shape: a tall group then gets the others beside it instead of empty space.
  const aspect = width / height;
  const pack = (rowWidth: number) => {
    const at: { x: number; y: number }[] = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let w = 0;
    for (const g of groups) {
      if (x > 0 && x + g.w > rowWidth) {
        x = 0;
        y += rowHeight + GAP;
        rowHeight = 0;
      }
      at.push({ x, y });
      x += g.w + GAP;
      rowHeight = Math.max(rowHeight, g.h);
      w = Math.max(w, x - GAP);
    }
    const h = y + rowHeight;
    return { at, w, h, frame: Math.max(w, h * aspect) };
  };
  const widest = Math.max(...groups.map((g) => g.w));
  let best = pack(widest);
  for (let i = 0, sum = 0; i < groups.length; i++) {
    sum += groups[i]!.w + (i > 0 ? GAP : 0);
    if (sum <= widest) continue;
    const tried = pack(sum);
    if (tried.frame < best.frame - 0.5) best = tried;
  }
  groups.forEach((g, i) => {
    for (const p of g.points) {
      p.x += best.at[i]!.x - g.box.x0;
      p.y += best.at[i]!.y - g.box.y0;
    }
  });
  const { w: usedW, h: usedH } = best;

  // A frame of the requested shape that holds the drawing; a small drawing is spread out, up to twice its size.
  const fit = Math.min((width - 2 * MARGIN) / usedW, (height - 2 * MARGIN) / usedH);
  const spread = Math.min(2, Math.max(1, fit));
  const frameW = Math.max(width, usedW * spread + 2 * MARGIN, ((usedH * spread + 2 * MARGIN) * width) / height);
  const frameH = (frameW * height) / width;
  const offsetX = (frameW - usedW * spread) / 2;
  const offsetY = (frameH - usedH * spread) / 2;
  for (const p of nodes) {
    p.x = offsetX + p.x * spread;
    p.y = offsetY + p.y * spread;
  }
  placeLabels(nodes, { x0: 0, y0: 0, x1: frameW, y1: frameH }, 1, edgeSegments(nodes, model.edges));
  return { nodes, edges: model.edges, width: frameW, height: frameH };
}

export function buildGraph(state: State, o: GraphOptions = {}): Graph {
  return layoutGraph(graphModel(state, o), o.width, o.height);
}
