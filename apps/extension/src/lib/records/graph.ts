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

/**
 * How long each relation is drawn: a concept with many relations gets longer lines, so the concepts around it have room
 * for their labels instead of piling up on it.
 */
function linkLengths(n: number, links: readonly (readonly [number, number])[]): number[] {
  // Two relations between the same two concepts (a prerequisite that is also related) count as one neighbour.
  const degree = new Array<number>(n).fill(0);
  const pairs = new Set<number>();
  for (const [a, b] of links) {
    const key = Math.min(a, b) * n + Math.max(a, b);
    if (pairs.has(key)) continue;
    pairs.add(key);
    degree[a]!++;
    degree[b]!++;
  }
  return links.map(([a, b]) => IDEAL * Math.max(1, 0.55 * Math.sqrt(Math.max(degree[a]!, degree[b]!))));
}

/** The length of the shortest path between every two nodes of one connected group, along the relations. */
function pathLengths(n: number, links: readonly (readonly [number, number])[]): Float64Array[] {
  const lengths = linkLengths(n, links);
  const next: { to: number; len: number }[][] = Array.from({ length: n }, () => []);
  links.forEach(([a, b], i) => {
    next[a]!.push({ to: b, len: lengths[i]! });
    next[b]!.push({ to: a, len: lengths[i]! });
  });
  return Array.from({ length: n }, (_, from) => {
    // Dijkstra with a plain scan: groups are at most a few hundred nodes.
    const dist = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    dist[from] = 0;
    for (let round = 0; round < n; round++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i]! < dist[u]!)) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = 1;
      for (const { to, len } of next[u]!) if (dist[u]! + len < dist[to]!) dist[to] = dist[u]! + len;
    }
    return dist;
  });
}

/**
 * A starting picture from the distances alone (classical scaling): the two main directions of the squared distances,
 * found by power iteration from fixed vectors, so the same records always give the same picture.
 */
function classicalScaling(dist: Float64Array[]): { x: number; y: number }[] {
  const n = dist.length;
  // B = -1/2 · J D² J, with J the centring matrix, kept as one flat array.
  const b = new Float64Array(n * n);
  const rowMean = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) rowMean[i]! += dist[i]![j]! * dist[i]![j]!;
    rowMean[i]! /= n;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += rowMean[i]! / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) b[i * n + j] = -0.5 * (dist[i]![j]! * dist[i]![j]! - rowMean[i]! - rowMean[j]! + mean);
  /** B times v. */
  const timesB = (v: Float64Array) => {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += b[i * n + j]! * v[j]!;
      w[i] = s;
    }
    return w;
  };
  const axes: { v: Float64Array; value: number }[] = [];
  /** Directions already found, kept apart from the next one. */
  const avoid: Float64Array[] = [];
  let skipped = 0;
  for (let k = 0; k < 2; k++) {
    let v = Float64Array.from({ length: n }, (_, i) => (k === 0 ? Math.cos(i + 0.5) : Math.sin(2 * i + 1)));
    /** No direction is left apart from the ones found: the distances fit fewer dimensions, and this axis adds nothing. */
    let flat = false;
    // Only a starting point: the stress rounds that follow settle the details.
    for (let iter = 0; iter < 60; iter++) {
      const w = timesB(v);
      // Keep it apart from the directions already found or set aside.
      for (const a of avoid) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += w[i]! * a[i]!;
        for (let i = 0; i < n; i++) w[i]! -= dot * a[i]!;
      }
      let norm = 0;
      for (let i = 0; i < n; i++) norm += w[i]! * w[i]!;
      norm = Math.sqrt(norm);
      if (norm < 1e-9) {
        flat = true;
        break;
      }
      for (let i = 0; i < n; i++) w[i]! /= norm;
      v = w;
    }
    // Power iteration finds the largest eigenvalue by size, and graph distances can give a negative one, which is no
    // direction of the picture: set it aside and look again (a few times at most; stress settles the rest).
    const bv = timesB(v);
    let rayleigh = 0;
    for (let i = 0; i < n; i++) rayleigh += v[i]! * bv[i]!;
    if (flat) {
      axes.push({ v, value: 0 });
      continue;
    }
    if (rayleigh < 0 && skipped < 3) {
      skipped++;
      avoid.push(v);
      k--;
      continue;
    }
    axes.push({ v, value: Math.max(0, rayleigh) });
    avoid.push(v);
  }
  return Array.from({ length: n }, (_, i) => ({
    x: axes[0]!.v[i]! * Math.sqrt(axes[0]!.value),
    y: axes[1]!.v[i]! * Math.sqrt(axes[1]!.value),
  }));
}

/**
 * Places one connected group so that the distance between every two concepts is as close as it can be to the length of
 * the path between them (stress majorization): relations come out an even length, branches spread out instead of folding
 * over each other, and the same records always give the same picture. Positions are relative to 0, 0.
 */
function stressLayout(points: { x: number; y: number; r: number }[], links: readonly (readonly [number, number])[], rounds: number): void {
  const n = points.length;
  if (n === 1) {
    points[0]!.x = 0;
    points[0]!.y = 0;
    return;
  }
  // Two concepts are kept no further apart than a group of this many would span if it were round: a long chain of
  // relations then curls up to fit the window instead of running off it in a straight line. Rounder groups never reach it.
  const reach = Math.max(6, 2 * Math.sqrt(n)) * IDEAL;
  const dist = pathLengths(n, links).map((row) => row.map((d) => Math.min(d, reach)));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  classicalScaling(dist).forEach((p, i) => {
    xs[i] = p.x;
    ys[i] = p.y;
  });
  // Each pair counts by one over its distance squared, so near neighbours matter most.
  const weight = dist.map((row) => row.map((d) => (d > 0 ? 1 / (d * d) : 0)));
  const weightSum = weight.map((row) => row.reduce((s, w) => s + w, 0));
  for (let round = 0; round < rounds; round++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const target = dist[i]!;
      const w = weight[i]!;
      const px = xs[i]!;
      const py = ys[i]!;
      let sx = 0;
      let sy = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const qx = xs[j]!;
        const qy = ys[j]!;
        let vx = px - qx;
        let vy = py - qy;
        let d = Math.sqrt(vx * vx + vy * vy);
        if (d < 1e-6) {
          // Two nodes on one spot (two leaves of one concept start there): part them in a direction fixed by their order.
          // The pair shares one angle and is pushed in opposite directions along it.
          const angle = (Math.min(i, j) * 7 + Math.max(i, j)) * 2.399963;
          const away = i < j ? 1 : -1;
          vx = away * Math.cos(angle);
          vy = away * Math.sin(angle);
          d = 1;
        }
        const pull = (target[j]! / d) * w[j]!;
        sx += w[j]! * qx + pull * vx;
        sy += w[j]! * qy + pull * vy;
      }
      const nx = sx / weightSum[i]!;
      const ny = sy / weightSum[i]!;
      moved = Math.max(moved, Math.abs(nx - px) + Math.abs(ny - py));
      xs[i] = nx;
      ys[i] = ny;
    }
    // Stop once no concept moves by more than about half a pixel.
    if (moved < 0.5) break;
  }
  points.forEach((p, i) => {
    p.x = xs[i]!;
    p.y = ys[i]!;
  });
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

/** The box a label takes at one of the places around its circle, with text `scale` times its usual size. */
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
    case 3: // left
      return {
        x: x - r - pad,
        y: y + font / 3,
        anchor: "end",
        box: { x0: x - r - pad - w, y0: y - tall / 2, x1: x - r - pad, y1: y + tall / 2 },
      };
    default: {
      // The four corners: above or below, starting at the circle's right or ending at its left.
      const right = place === 4 || place === 5;
      const below = place === 5 || place === 7;
      const side = r * 0.7 + pad / 2;
      const y0 = below ? y + side : y - side - tall;
      return {
        x: right ? x + side : x - side,
        y: y0 + font,
        anchor: right ? "start" : "end",
        box: { x0: right ? x + side : x - side - w, y0, x1: right ? x + side + w : x - side, y1: y0 + tall },
      };
    }
  }
}

/** How many places around a circle a label is tried at. */
const LABEL_PLACES = 8;

/** Whether one cost is lower than another, comparing the first figure that differs. */
function cheaper(a: readonly number[], b: readonly number[]): boolean {
  for (let k = 0; k < a.length; k++) if (a[k] !== (b[k] ?? Infinity)) return a[k]! < (b[k] ?? Infinity);
  return false;
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
 * Places each label above, below, right, left or at a corner of its circle, wherever it covers no circle and no label placed before,
 * preferring the place that crosses the fewest lines. Studied concepts and the best connected go first; a label with no
 * free place is shown only on hover. `scale` is the size the text is drawn at, in units of the map: zoomed out, labels take
 * more of the map and fewer of them fit.
 *
 * `others` are circles drawn behind these nodes (the faded ones while a concept is pointed at): a label avoids them where
 * it can but may cover them. With `always`, every label is shown, at the place that covers the fewest labels and circles,
 * for when the names must be read whatever the crowding.
 */
export function placeLabels(
  nodes: GraphNode[],
  frame: Box,
  scale = 1,
  segments: readonly Segment[] = [],
  { others = [], always = false }: { others?: readonly { x: number; y: number; r: number }[]; always?: boolean } = {},
): void {
  // A label keeps a little clear of every other circle, so it is not read as that circle's name.
  const clear = 3 * scale;
  const around = (n: { x: number; y: number; r: number }): Box => ({
    x0: n.x - n.r - clear,
    y0: n.y - n.r - clear,
    x1: n.x + n.r + clear,
    y1: n.y + n.r + clear,
  });
  const circles: Box[] = nodes.map(around);
  const behind: Box[] = others.map(around);
  const placed: Box[] = [];
  const order = nodes
    .map((_, i) => i)
    .sort((a, b) => Number(nodes[b]!.studied) - Number(nodes[a]!.studied) || nodes[b]!.degree - nodes[a]!.degree || a - b);
  const count = (boxes: readonly Box[], box: Box, skip = -1) => boxes.reduce((n, b, j) => n + Number(j !== skip && overlaps(b, box)), 0);
  for (const i of order) {
    const node = nodes[i]!;
    let chosen: ReturnType<typeof labelBox> | undefined;
    /** What a place costs, compared in order: labels and circles it covers, then circles behind it, then lines it crosses. */
    let best: number[] = [Infinity];
    for (let place = 0; place < LABEL_PLACES && best.some((v) => v > 0); place++) {
      const c = labelBox(node, place, scale);
      const outside = Number(!(c.box.x0 >= frame.x0 && c.box.x1 <= frame.x1 && c.box.y0 >= frame.y0 && c.box.y1 <= frame.y1));
      const covered = count(placed, c.box) + count(circles, c.box, i);
      if ((outside || covered > 0) && !always) continue;
      // Even when every label must be shown, one inside the map beats one cut off at its edge.
      const cost = [outside, covered, count(behind, c.box), segments.reduce((n, s) => n + Number(crosses(s, c.box)), 0)];
      if (cheaper(cost, best)) {
        best = cost;
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
    stressLayout(points, own, rounds);
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
