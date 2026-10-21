import { DAY_MS, type State } from "@harkback/core";
import { DOMAINS, type Domain } from "@harkback/spec";
import type { Understanding } from "../records/concept-detail";
import { buildGraph, edgeSegments, placeLabels } from "../records/graph";
import { h } from "../ui/dom";
import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";

/** What the map shows; kept by the page, so it survives the map being drawn again. */
export interface GraphFilter {
  domain: "" | Domain;
  understanding: "" | Understanding;
  days: number;
  unexplained: boolean;
}

export const defaultGraphFilter = (): GraphFilter => ({ domain: "", understanding: "", days: 0, unexplained: true });

export interface GraphViewDeps {
  state: State;
  lang: Lang;
  /** The search box: only concepts named so, and the ones they connect to. */
  query: string;
  /** The width the map is shown at; 0 when it cannot be measured. */
  width: number;
  filter: GraphFilter;
  nameOf(id: string): string;
  conceptHref(id: string): string;
  /** Draws the page again and puts the keyboard back on the control marked `focus`. */
  redraw(focus: string): void;
}

const SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag: string, attrs: Record<string, string | number> = {}, ...children: Node[]): SVGElement => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
};

/** The map's size when the page cannot be measured; it is otherwise laid out for the size it is shown at. */
const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 640;
/** The smallest scale a map opens at, so its circles stay big enough to point at. */
const MIN_GRAPH_SCALE = 0.45;

/** A drop-down that redraws the map when it changes and keeps the keyboard where it was. */
function graphSelect(
  deps: GraphViewDeps,
  name: string,
  label: string,
  options: [string, string][],
  value: string,
  set: (v: string) => void,
): HTMLElement {
  const select = h(
    "select",
    { "data-hb": `graph-filter-${name}`, "aria-label": label },
    ...options.map(([v, text]) => h("option", { value: v }, text)),
  );
  select.value = value;
  select.addEventListener("change", () => {
    set(select.value);
    deps.redraw(`graph-filter-${name}`);
  });
  return h("label", {}, label, " ", select);
}

function graphFilterBar(deps: GraphViewDeps): HTMLElement {
  const { filter: graphFilter } = deps;
  const L = (zh: string, en: string) => pick(deps.lang, zh, en);
  return h(
    "div",
    { className: "graph-filters", "data-hb": "graph-filters" },
    graphSelect(
      deps,
      "domain",
      L("领域", "Field"),
      [["", L("全部领域", "All fields")], ...DOMAINS.map((d): [string, string] => [d, d])],
      graphFilter.domain,
      (v) => (graphFilter.domain = v as "" | Domain),
    ),
    graphSelect(
      deps,
      "understanding",
      L("理解程度", "Understanding"),
      [
        ["", L("全部", "All levels")],
        ["understood", L("已理解", "Understood")],
        ["shaky", L("不太牢", "Shaky")],
        ["confused", L("仍困惑", "Confused")],
        ["new", L("新", "New")],
      ],
      graphFilter.understanding,
      (v) => (graphFilter.understanding = v as "" | Understanding),
    ),
    graphSelect(
      deps,
      "days",
      L("最近查过", "Looked up"),
      [
        ["0", L("任何时间", "Any time")],
        ["7", L("最近 7 天", "Last 7 days")],
        ["30", L("最近 30 天", "Last 30 days")],
        ["90", L("最近 90 天", "Last 90 days")],
      ],
      String(graphFilter.days),
      (v) => (graphFilter.days = Number(v)),
    ),
    graphUnexplainedToggle(deps),
  );
}

/** Whether concepts nobody has explained yet are drawn. */
function graphUnexplainedToggle(deps: GraphViewDeps): HTMLElement {
  const { filter: graphFilter } = deps;
  const L = (zh: string, en: string) => pick(deps.lang, zh, en);
  const box = h("input", { type: "checkbox", "data-hb": "graph-filter-unexplained" }) as HTMLInputElement;
  box.checked = graphFilter.unexplained;
  box.addEventListener("change", () => {
    graphFilter.unexplained = box.checked;
    deps.redraw("graph-filter-unexplained");
  });
  return h("label", { className: "graph-toggle" }, box, " ", L("显示还没解释过的概念", "Show concepts not explained yet"));
}

/** The concepts as a map: relations as lines, colour by how well each is understood. Drag to move, wheel to zoom. */
export function graphView(deps: GraphViewDeps): HTMLElement {
  const { state, filter: graphFilter } = deps;
  const L = (zh: string, en: string) => pick(deps.lang, zh, en);
  const filtered = graphFilter.domain !== "" || graphFilter.understanding !== "" || graphFilter.days > 0 || !graphFilter.unexplained;
  // Laid out for the box it is drawn in (see svg.graph in the page's style), so one unit of the map is one pixel.
  const width = deps.width || GRAPH_WIDTH;
  const height = Math.min(window.innerHeight * 0.7, GRAPH_HEIGHT) || GRAPH_HEIGHT;
  const g = buildGraph(state, {
    query: deps.query,
    ...(graphFilter.domain && { domain: graphFilter.domain }),
    ...(graphFilter.understanding && { understanding: graphFilter.understanding }),
    ...(graphFilter.days > 0 && { since: Date.now() - graphFilter.days * DAY_MS }),
    unexplained: graphFilter.unexplained,
    nameOf: deps.nameOf,
    width,
    height,
  });
  if (g.nodes.length === 0) {
    return h(
      "div",
      {},
      graphFilterBar(deps),
      h(
        "p",
        { className: "empty", "data-hb": "graph-empty" },
        filtered
          ? L("没有符合这些筛选条件的概念。", "No concepts match these filters.")
          : L("还没有可显示的概念。", "No concepts to show yet."),
      ),
    );
  }
  // The whole map, unless that would draw it too small to read: then it opens on its best connected concept, and zooming
  // out shows the rest.
  const view = { x: 0, y: 0, w: g.width, h: g.height };
  if (g.width > width / MIN_GRAPH_SCALE) {
    const focus = g.nodes[0]!;
    view.w = width / MIN_GRAPH_SCALE;
    view.h = (view.w * g.height) / g.width;
    view.x = Math.min(Math.max(0, focus.x - view.w / 2), g.width - view.w);
    view.y = Math.min(Math.max(0, focus.y - view.h / 2), g.height - view.h);
  }
  const svg = svgEl("svg", {
    class: "graph",
    viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
    role: "group",
    "data-hb": "graph",
  });
  svg.setAttribute("aria-label", L("概念关系图", "Concept graph"));
  const marker = (rel: string) =>
    svgEl(
      "marker",
      {
        id: `arrow-${rel}`,
        class: rel,
        viewBox: "0 0 10 10",
        refX: 10,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: "auto-start-reverse",
      },
      svgEl("path", { d: "M0 0 L10 5 L0 10 z" }),
    );
  svg.append(svgEl("defs", {}, marker("prerequisite"), marker("variant_of")));
  const at = new Map(g.nodes.map((n) => [n.id, n]));
  /** Each concept's relations as drawn, and the concepts at their other ends: what pointing at a concept brings forward. */
  const touching = new Map<string, { lines: SVGElement[]; ids: Set<string> }>();
  const touch = (id: string) => touching.get(id) ?? touching.set(id, { lines: [], ids: new Set([id]) }).get(id)!;
  const edgeLayer = svgEl("g", { class: "edges" });
  const nodeLayer = svgEl("g", { class: "nodes" });
  svg.append(edgeLayer, nodeLayer);
  /** The radius each circle is drawn at: zoomed out, circles grow on the map so they stay big enough to see and point at. */
  const radius = new Map(g.nodes.map((n) => [n.id, n.r]));
  const lines: { line: SVGElement; a: (typeof g.nodes)[number]; b: (typeof g.nodes)[number] }[] = [];
  /** From the edge of one circle to the edge of the other, so an arrow points at the circle instead of hiding under it. */
  const trim = ({ line, a, b }: (typeof lines)[number]) => {
    const ra = radius.get(a.id)!;
    const rb = radius.get(b.id)!;
    const d = Math.max(0.01, Math.hypot(b.x - a.x, b.y - a.y));
    const ux = (b.x - a.x) / d;
    const uy = (b.y - a.y) / d;
    // Circles that overlap keep the whole line: trimming both ends would make it point backwards.
    const apart = d > ra + rb + 4;
    const start = apart ? ra : 0;
    const end = apart ? rb + 2 : 0;
    line.setAttribute("x1", String(a.x + ux * start));
    line.setAttribute("y1", String(a.y + uy * start));
    line.setAttribute("x2", String(b.x - ux * end));
    line.setAttribute("y2", String(b.y - uy * end));
  };
  for (const e of g.edges) {
    const a = at.get(e.from)!;
    const b = at.get(e.to)!;
    const line = svgEl("line", {
      class: `edge ${e.rel}`,
      ...(e.rel === "related" ? {} : { "marker-end": `url(#arrow-${e.rel})` }),
    });
    lines.push({ line, a, b });
    trim(lines.at(-1)!);
    edgeLayer.append(line);
    for (const [one, other] of [
      [e.from, e.to],
      [e.to, e.from],
    ] as const) {
      touch(one).lines.push(line);
      touch(one).ids.add(other);
    }
  }
  const nodeEls = new Map<string, { el: SVGElement; text: SVGElement; circle: SVGElement }>();
  for (const n of g.nodes) {
    const name = n.name;
    const title = n.explained ? name : `${name} — ${L("还没解释过", "Not explained yet")}`;
    const circle = svgEl("circle", { cx: n.x, cy: n.y, r: n.r });
    const text = svgEl(
      "text",
      { x: n.labelX, y: n.labelY, "text-anchor": n.labelAnchor, ...(!n.labelShown && { class: "crowded" }) },
      document.createTextNode(n.label),
    );
    // A concept that is only mentioned has no page to open: it can be pointed at to read its name, but is not a link. One only
    // highlighted in Zotero is drawn as not explained yet, and still opens its page.
    const node = svgEl(
      n.studied ? "a" : "g",
      {
        ...(n.studied ? { href: deps.conceptHref(n.id) } : { tabindex: 0, role: "img", "aria-label": title }),
        class: `node ${n.explained ? n.understanding : "unstudied"}`,
        "data-hb": "graph-node",
        "data-id": n.id,
      },
      circle,
      text,
    );
    node.append(svgEl("title", {}, document.createTextNode(title)));
    nodeLayer.append(node);
    nodeEls.set(n.id, { el: node, text, circle });
    const bring = () => {
      const near = touching.get(n.id) ?? { lines: [], ids: new Set([n.id]) };
      svg.classList.add("focusing");
      for (const line of near.lines) line.classList.add("near");
      for (const id of near.ids) nodeEls.get(id)?.el.classList.add("near");
    };
    const leave = () => {
      svg.classList.remove("focusing");
      for (const el of svg.querySelectorAll(".near")) el.classList.remove("near");
    };
    node.addEventListener("pointerenter", bring);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("focus", bring);
    node.addEventListener("blur", leave);
  }

  const segments = edgeSegments(g.nodes, g.edges);
  /** How many units of the map one pixel on screen is: labels and lines keep their size on screen at any zoom. */
  const unitsPerPixel = (): number => {
    const ctm = (svg as SVGGraphicsElement).getScreenCTM?.();
    return ctm && ctm.a > 0 ? 1 / ctm.a : Math.max(view.w / (width || view.w), view.h / (height || view.h));
  };
  /** Places the labels again for the size they are now drawn at: zoomed out, fewer fit; zoomed in, all of them. */
  let shownScale = NaN;
  const placeAll = () => {
    const scale = unitsPerPixel();
    svg.style.setProperty("--u", String(scale));
    if (Math.abs(scale - shownScale) < 0.02) return;
    shownScale = scale;
    const grow = Math.min(Math.max(scale, 1), 1.6);
    for (const n of g.nodes) radius.set(n.id, n.r * grow);
    for (const l of lines) trim(l);
    // Labels are placed around the circles as drawn; the layout's own radii stay as they were.
    const drawn = g.nodes.map((n) => ({ ...n, r: radius.get(n.id)! }));
    placeLabels(drawn, { x0: 0, y0: 0, x1: g.width, y1: g.height }, scale, segments);
    for (const n of drawn) {
      const { text, circle } = nodeEls.get(n.id)!;
      circle.setAttribute("r", String(n.r));
      text.setAttribute("x", String(n.labelX));
      text.setAttribute("y", String(n.labelY));
      text.setAttribute("text-anchor", n.labelAnchor);
      text.classList.toggle("crowded", !n.labelShown);
    }
  };
  let placing = 0;
  const apply = () => {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    svg.style.setProperty("--u", String(unitsPerPixel()));
    cancelAnimationFrame(placing);
    placing = requestAnimationFrame(placeAll);
  };
  // Placed again once the map is on the page and its size on screen is known.
  const first = (tries: number) => requestAnimationFrame(() => (svg.isConnected ? placeAll() : tries > 0 && first(tries - 1)));
  first(10);

  /** Zooms by `factor` (below 1 is in) around a point of the map, the middle of the view by default. */
  const zoom = (factor: number, px = view.x + view.w / 2, py = view.y + view.h / 2) => {
    // In no further than an eighth of the map, out no further than the whole of it.
    const w = Math.min(g.width, Math.max(g.width / 8, view.w * factor));
    const k = w / view.w;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.w = w;
    view.h = view.h * k;
    if (w >= g.width) Object.assign(view, { x: 0, y: 0, w: g.width, h: g.height });
    apply();
  };
  /** A point on screen as a point of the map, whatever the box's shape. */
  const toMap = (clientX: number, clientY: number): { x: number; y: number } => {
    const ctm = (svg as SVGGraphicsElement).getScreenCTM?.();
    if (!ctm) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  svg.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const p = toMap(ev.clientX, ev.clientY);
      zoom(ev.deltaY < 0 ? 0.85 : 1 / 0.85, p.x, p.y);
    },
    { passive: false },
  );
  let drag: { x: number; y: number } | null = null;
  svg.addEventListener("pointerdown", (ev) => {
    if ((ev.target as Element).closest(".node")) return;
    drag = toMap(ev.clientX, ev.clientY);
    svg.classList.add("dragging");
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const p = toMap(ev.clientX, ev.clientY);
    view.x -= p.x - drag.x;
    view.y -= p.y - drag.y;
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  });
  const end = () => {
    drag = null;
    svg.classList.remove("dragging");
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  const zoomButton = (hb: string, label: string, text: string, act: () => void): HTMLElement => {
    const b = h("button", { type: "button", className: "small", "data-hb": hb, "aria-label": label, title: label }, text);
    b.addEventListener("click", act);
    return b;
  };
  const controls = h(
    "div",
    { className: "graph-zoom" },
    zoomButton("graph-zoom-in", L("放大", "Zoom in"), "+", () => zoom(0.7)),
    zoomButton("graph-zoom-out", L("缩小", "Zoom out"), "−", () => zoom(1 / 0.7)),
    zoomButton("graph-fit", L("显示整张图", "Show the whole map"), "⤢", () => zoom(Infinity)),
  );

  const swatch = (cls: string) =>
    svgEl(
      "svg",
      { class: "swatch", viewBox: "0 0 14 14", "aria-hidden": "true" },
      svgEl("g", { class: `node ${cls}` }, svgEl("circle", { cx: 7, cy: 7, r: 5 })),
    );
  const lineSwatch = (cls: string) =>
    svgEl(
      "svg",
      { class: "swatch", viewBox: "0 0 24 10", "aria-hidden": "true" },
      svgEl("line", { class: `edge ${cls}`, x1: 1, y1: 5, x2: 23, y2: 5 }),
    );
  const key = (mark: SVGElement, text: string) => h("span", { className: "key" }, mark, text);
  return h(
    "div",
    {},
    graphFilterBar(deps),
    h(
      "div",
      { className: "graph-wrap" },
      svg,
      controls,
      h(
        "div",
        { className: "legend", "data-hb": "graph-legend" },
        h(
          "div",
          { className: "legend-row" },
          key(lineSwatch("prerequisite"), L("前置概念", "Prerequisite")),
          key(lineSwatch("variant_of"), L("变体", "Variant")),
          key(lineSwatch("related"), L("相关", "Related")),
        ),
        h(
          "div",
          { className: "legend-row" },
          key(swatch("understood"), L("已理解", "Understood")),
          key(swatch("shaky"), L("不太牢", "Shaky")),
          key(swatch("confused"), L("仍困惑", "Confused")),
          key(swatch("new"), L("新", "New")),
          key(swatch("unstudied"), L("还没解释过", "Not explained yet")),
        ),
        h(
          "div",
          { className: "legend-hint" },
          L(
            "拖动移动，滚轮缩放；指向一个概念会突出它的关系。",
            "Drag to move, scroll to zoom; point at a concept to bring out its relations.",
          ),
        ),
      ),
    ),
  );
}
