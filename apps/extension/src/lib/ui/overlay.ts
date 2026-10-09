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

export function placeNear(el: HTMLElement, rect: DOMRect | null, width = 380): void {
  const viewport = document.documentElement.clientWidth || window.innerWidth;
  const left = Math.max(8, Math.min(rect?.left ?? 16, viewport - width - 8));
  const top = rect ? rect.bottom + 8 : 16;
  el.style.left = `${left + window.scrollX}px`;
  el.style.top = `${top + window.scrollY}px`;
}
