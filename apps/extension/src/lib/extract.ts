import { Readability } from "@mozilla/readability";
import type { Locator } from "@harkback/spec";
import { isArxivUrl } from "./source-id";

/** Elements created by the extension; never scanned or used as context. */
export const ownHosts = new WeakSet<Element>();

const SKIP = new Set([
  "script", "style", "noscript", "template", "nav", "header", "footer", "aside", "form",
  "button", "select", "textarea", "input", "svg", "canvas", "iframe", "object", "video", "audio",
]);
const BLOCKS = new Set([
  "p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "td", "th", "dd", "dt",
  "figcaption", "caption", "summary", "div", "section", "article", "main", "figure", "details", "body",
]);
const HEADING = /^h[1-6]$/;
const INDEX_ATTR = "data-harkback-i";
const CONTEXT_CHARS = 32;
const TEXT = 3;
const ELEMENT = 1;

export interface Segment {
  node: Node;
  start: number;
  end: number;
}

export interface Block {
  id: string;
  el: Element;
  start: number;
  end: number;
  section: string;
}

export interface ExtractedPage {
  root: Element;
  text: string;
  segments: Segment[];
  blocks: Block[];
  abstractFirstSentence: string;
}

export interface SelectionContext {
  selection: string;
  paragraph: string;
  paragraphId: string;
  section: string;
  locator: Locator;
}

const normalizeWs = (s: string): string => s.replace(/\s+/g, " ").trim();

export function firstSentence(text: string): string {
  // CJK sentence ends need no following space.
  const m = /^(.+?(?:[.!?](?=\s|$)|[。！？]))/.exec(text);
  return (m ? m[1]! : text).trim();
}

function isHidden(el: Element): boolean {
  if (ownHosts.has(el) || el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return true;
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (style?.display === "none" || style?.visibility === "hidden") return true;
  // On a live page, also honour stylesheets (class-based hiding, collapsed menus).
  const view = el.ownerDocument.defaultView;
  if (!view || !el.isConnected) return false;
  const computed = view.getComputedStyle(el);
  return computed.display === "none" || computed.visibility === "hidden";
}

function blockOf(node: Node, root: Element): Element {
  let el = node.nodeType === ELEMENT ? (node as Element) : node.parentElement;
  while (el && el !== root) {
    if (BLOCKS.has(el.localName)) return el;
    el = el.parentElement;
  }
  return root;
}

function commonAncestor(a: Element, b: Element): Element {
  const seen = new Set<Element>();
  for (let x: Element | null = a; x; x = x.parentElement) seen.add(x);
  for (let y: Element | null = b; y; y = y.parentElement) if (seen.has(y)) return y;
  return a.ownerDocument.documentElement;
}

/** Lets Readability pick the article on an inert clone, then maps its paragraphs back to live elements. */
function readabilityRoot(doc: Document): Element | null {
  if (!doc.body) return null;
  const clone = doc.cloneNode(true) as Document;
  if (!clone.body) return null;
  clone.body.querySelectorAll("*").forEach((el, i) => el.setAttribute(INDEX_ATTR, String(i)));
  let content: string | null | undefined;
  try {
    content = new Readability(clone).parse()?.content;
  } catch {
    return null;
  }
  if (!content) return null;
  const parsed = new DOMParser().parseFromString(content, "text/html");
  const live = doc.body.querySelectorAll("*");
  const picked = [...parsed.querySelectorAll(`p[${INDEX_ATTR}], li[${INDEX_ATTR}], pre[${INDEX_ATTR}], blockquote[${INDEX_ATTR}]`)]
    .map((el) => live[Number(el.getAttribute(INDEX_ATTR))])
    .filter((el): el is Element => el !== undefined);
  return picked.length > 0 ? picked.reduce(commonAncestor) : null;
}

function contentRoot(doc: Document, url: string): Element {
  if (isArxivUrl(url)) {
    const ltx = doc.querySelector(".ltx_page_content") ?? doc.querySelector("article.ltx_document");
    if (ltx) return ltx;
  }
  return readabilityRoot(doc) ?? doc.querySelector("article, main, [role='main']") ?? doc.body ?? doc.documentElement;
}

export function extractPage(doc: Document, url: string): ExtractedPage {
  const root = contentRoot(doc, url);
  let text = "";
  const segments: Segment[] = [];
  const blocks: Block[] = [];
  let current: Block | null = null;
  let section = "";

  const add = (node: Node, data: string) => {
    if (!data) return;
    const el = blockOf(node, root);
    let block = current;
    if (!block || block.el !== el) {
      // Whitespace between blocks is layout, not content.
      if (!/\S/.test(data)) return;
      if (text.length > 0) text += "\n";
      if (HEADING.test(el.localName)) section = normalizeWs(el.textContent ?? "");
      block = { id: `b${blocks.length}`, el, start: text.length, end: text.length, section };
      blocks.push(block);
      current = block;
    }
    segments.push({ node, start: text.length, end: text.length + data.length });
    text += data;
    block.end = text.length;
  };

  const visit = (node: Node): void => {
    if (node.nodeType === TEXT) {
      add(node, (node as Text).data);
      return;
    }
    if (node.nodeType !== ELEMENT) return;
    const el = node as Element;
    if (SKIP.has(el.localName) || isHidden(el)) return;
    if (el.localName === "math") {
      add(el, el.getAttribute("alttext") ?? el.textContent ?? "");
      return;
    }
    for (let c = el.firstChild; c; c = c.nextSibling) visit(c);
  };
  visit(root);

  const abstract =
    doc.querySelector(".ltx_abstract p")?.textContent ??
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ??
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
    (() => {
      const b = blocks.find((x) => !HEADING.test(x.el.localName));
      return b ? text.slice(b.start, b.end) : "";
    })();

  return { root, text, segments, blocks, abstractFirstSentence: firstSentence(normalizeWs(abstract)).slice(0, 500) };
}

function segmentAt(segments: readonly Segment[], offset: number): Segment | null {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid]!;
    if (offset < s.start) hi = mid - 1;
    else if (offset >= s.end) lo = mid + 1;
    else return s;
  }
  return null;
}

function blockAt(blocks: readonly Block[], offset: number): Block | null {
  let found: Block | null = null;
  for (const b of blocks) {
    if (b.start > offset) break;
    found = b;
  }
  return found;
}

export function rangeFor(page: ExtractedPage, start: number, end: number): Range | null {
  if (end <= start) return null;
  const a = segmentAt(page.segments, start);
  const b = segmentAt(page.segments, end - 1);
  if (!a || !b) return null;
  const range = page.root.ownerDocument.createRange();
  if (a.node.nodeType === TEXT) range.setStart(a.node, start - a.start);
  else range.setStartBefore(a.node);
  if (b.node.nodeType === TEXT) range.setEnd(b.node, end - b.start);
  else range.setEndAfter(b.node);
  return range;
}

function segmentFor(page: ExtractedPage, node: Node): Segment | undefined {
  const el = node.nodeType === ELEMENT ? (node as Element) : node.parentElement;
  const target: Node = el?.closest("math") ?? node;
  return page.segments.find((s) => s.node === target);
}

function leaf(node: Node | null | undefined, last: boolean): Node | null {
  let n = node ?? null;
  while (n && n.nodeType === ELEMENT && (n as Element).localName !== "math" && n.firstChild) n = last ? n.lastChild : n.firstChild;
  return n;
}

function boundaryOffset(page: ExtractedPage, container: Node, offset: number, atEnd: boolean): number | null {
  const node = container.nodeType === TEXT ? container : leaf(container.childNodes[atEnd ? offset - 1 : offset], atEnd);
  if (!node) return null;
  const seg = segmentFor(page, node);
  if (!seg) return null;
  if (seg.node === node && node === container) return seg.start + Math.min(offset, seg.end - seg.start);
  return atEnd ? seg.end : seg.start;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function outsideContext(range: Range, selection: string): SelectionContext {
  let el: Element | null = range.startContainer.nodeType === ELEMENT ? (range.startContainer as Element) : range.startContainer.parentElement;
  while (el && !BLOCKS.has(el.localName) && !SKIP.has(el.localName)) el = el.parentElement;
  const paragraph = normalizeWs(el?.textContent ?? selection).slice(0, 2000);
  const at = paragraph.indexOf(selection);
  const prefix = at >= 0 ? paragraph.slice(Math.max(0, at - CONTEXT_CHARS), at).trim() : "";
  const suffix = at >= 0 ? paragraph.slice(at + selection.length, at + selection.length + CONTEXT_CHARS).trim() : "";
  return { selection, paragraph, paragraphId: `outside:${hash(paragraph)}`, section: "", locator: { exact: selection.slice(0, 500), prefix, suffix } };
}

export function contextForRange(page: ExtractedPage, range: Range): SelectionContext | null {
  const selection = normalizeWs(range.toString());
  if (!selection) return null;
  const start = boundaryOffset(page, range.startContainer, range.startOffset, false);
  const end = boundaryOffset(page, range.endContainer, range.endOffset, true);
  if (start === null || end === null || end < start) return outsideContext(range, selection);
  const first = blockAt(page.blocks, start);
  if (!first) return outsideContext(range, selection);
  const last = blockAt(page.blocks, Math.max(start, end - 1)) ?? first;
  const paragraph = normalizeWs(page.text.slice(first.start, Math.max(first.end, last.end))).slice(0, 2000);
  return {
    selection,
    paragraph,
    paragraphId: first.id,
    section: first.section,
    locator: {
      exact: selection.slice(0, 500),
      prefix: normalizeWs(page.text.slice(Math.max(0, start - CONTEXT_CHARS), start)).slice(-64),
      suffix: normalizeWs(page.text.slice(end, end + CONTEXT_CHARS)).slice(0, 64),
      ...(first.section ? { section: first.section.slice(0, 200) } : {}),
    },
  };
}
