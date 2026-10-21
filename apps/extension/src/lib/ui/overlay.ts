import { ownHosts } from "../source/extract";
import { STYLES } from "./styles";

export interface Overlay {
  host: HTMLElement;
  root: ShadowRoot;
  destroy(): void;
}

/** One host per page, created only when something is about to be shown. Page text nodes are never modified. */
export function createOverlay(mode: "open" | "closed"): Overlay {
  const host = document.createElement("div");
  host.style.cssText = "all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: visible; z-index: 2147483647;";
  ownHosts.add(host);
  const root = host.attachShadow({ mode });
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.append(style);
  document.documentElement.append(host);
  return { host, root, destroy: () => host.remove() };
}

/** Whether the text at the end of a range runs right to left on the page, whatever the interface language is. */
export function runsRtl(range: Range): boolean {
  const node = range.endContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el ? getComputedStyle(el).direction === "rtl" : false;
}

/** Puts a card under a selection: its start edge lines up with the start of the selection, which is its right edge in right-to-left text. */
export function placeNear(el: HTMLElement, rect: DOMRect | null, width = 400, rtl = false): void {
  const viewport = document.documentElement.clientWidth || window.innerWidth;
  const anchor = rtl ? (rect?.right ?? viewport - 16) - width : (rect?.left ?? 16);
  const left = Math.max(8, Math.min(anchor, viewport - width - 8));
  const top = rect ? rect.bottom + 8 : 16;
  el.style.left = `${left + window.scrollX}px`;
  el.style.top = `${top + window.scrollY}px`;
}

/**
 * The boxes of a range on screen, cut to what its scrolling ancestors show: text scrolled out of sight inside a panel has no
 * box, and a line half out of it only its visible part.
 */
export function visibleRects(range: Range): DOMRect[] {
  let left = -Infinity;
  let top = -Infinity;
  let right = Infinity;
  let bottom = Infinity;
  const start = range.commonAncestorContainer;
  for (let el = start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement; el; el = el.parentElement) {
    // The page itself scrolls the overlay along with the text.
    if (el === document.documentElement || el === document.body) break;
    const s = getComputedStyle(el);
    if (s.overflowX === "visible" && s.overflowY === "visible") continue;
    const r = el.getBoundingClientRect();
    left = Math.max(left, r.left);
    top = Math.max(top, r.top);
    right = Math.min(right, r.right);
    bottom = Math.min(bottom, r.bottom);
  }
  const out: DOMRect[] = [];
  for (const r of range.getClientRects()) {
    const l = Math.max(r.left, left);
    const t = Math.max(r.top, top);
    const w = Math.min(r.right, right) - l;
    const ht = Math.min(r.bottom, bottom) - t;
    if (w > 0 && ht > 0) out.push(new DOMRect(l, t, w, ht));
  }
  return out;
}
