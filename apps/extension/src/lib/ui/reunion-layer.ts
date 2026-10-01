import { h } from "../dom";
import type { ReunionCard } from "../reunion-cards";
import type { Overlay } from "./overlay";
import { quoteTitle } from "./languages";
import { t, type Lang } from "./strings";

export type ReunionAction = "recalled" | "reexplain" | "compare" | "mute";

const ACTIONS: readonly ReunionAction[] = ["recalled", "reexplain", "compare", "mute"];
const HIDE_DELAY_MS = 300;

export function reunionCardView(card: ReunionCard, lang: Lang, act: (a: ReunionAction) => void): HTMLElement {
  const title =
    card.kind === "direct"
      ? `${card.conceptName} · ${t(lang, "daysAgo", { n: card.daysAgo })} · ${quoteTitle(card.sourceTitle, lang)}${card.section ? ` §${card.section}` : ""}`
      : t(lang, "related", { a: card.conceptName, n: card.daysAgo, b: card.viaName ?? "" });
  const tier = t(lang, card.tier === "defined_in_source" ? "tierDefined" : "tierExternal");
  return h(
    "div",
    { className: "hb-card hb-reunion", "data-hb": "reunion-card" },
    h(
      "div",
      { className: "hb-meta" },
      h("span", { "data-hb": "reunion-title" }, title),
      " ",
      h("span", { className: `hb-tier hb-${card.tier}` }, tier),
    ),
    h("div", { className: "hb-body" }, t(lang, "thenExplained", { text: card.preview })),
    h(
      "div",
      { className: "hb-footer" },
      ...ACTIONS.map((a) =>
        h(
          "button",
          {
            type: "button",
            className: a === "recalled" ? "hb-primary" : a === "mute" ? "hb-quiet" : null,
            "data-hb": a,
            onclick: () => act(a),
          },
          t(lang, a),
        ),
      ),
    ),
  );
}

interface Item {
  card: ReunionCard;
  range: Range;
  mark: HTMLElement;
}

function firstRect(range: Range): DOMRect | null {
  const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : r;
}

/** Dashed underlines drawn in the overlay (page nodes are untouched) and a hover card for each. */
export class ReunionLayer {
  private items: Item[] = [];
  private hover: { item: Item; el: HTMLElement } | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly overlay: Overlay,
    private readonly lang: Lang,
    private readonly onAction: (card: ReunionCard, action: ReunionAction, range: Range) => void,
  ) {}

  show(entries: readonly { card: ReunionCard; range: Range }[]): void {
    this.clear();
    for (const { card, range } of entries) {
      const mark = h("div", { className: "hb-mark", "data-hb": "mark" });
      this.overlay.root.append(mark);
      this.items.push({ card, range, mark });
    }
    this.layout();
    window.addEventListener("resize", this.layout, { passive: true });
    document.addEventListener("mousemove", this.onMove, { capture: true, passive: true });
  }

  clear(): void {
    window.removeEventListener("resize", this.layout);
    document.removeEventListener("mousemove", this.onMove, { capture: true });
    this.closeHover();
    for (const item of this.items) item.mark.remove();
    this.items = [];
  }

  private readonly layout = (): void => {
    for (const item of this.items) {
      const r = firstRect(item.range);
      if (!r) {
        item.mark.style.display = "none";
        continue;
      }
      item.mark.style.display = "block";
      item.mark.style.left = `${r.left + window.scrollX}px`;
      item.mark.style.top = `${r.bottom + window.scrollY - 1}px`;
      item.mark.style.width = `${r.width}px`;
    }
  };

  private readonly onMove = (e: MouseEvent): void => {
    const hit = this.items.find((item) => {
      const r = firstRect(item.range);
      return r !== null && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 4;
    });
    const overCard = this.hover !== null && e.composedPath().includes(this.overlay.host);
    if (hit || overCard) {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
      }
      if (hit && this.hover?.item !== hit) this.openHover(hit);
      return;
    }
    if (this.hover && !this.hideTimer) this.hideTimer = setTimeout(() => this.closeHover(), HIDE_DELAY_MS);
  };

  private openHover(item: Item): void {
    this.closeHover();
    const el = reunionCardView(item.card, this.lang, (action) => {
      if (action === "recalled") this.remove((x) => x === item);
      if (action === "mute") this.remove((x) => x.card.conceptId === item.card.conceptId);
      this.closeHover();
      this.onAction(item.card, action, item.range);
    });
    const r = firstRect(item.range);
    el.style.left = `${Math.max(8, r?.left ?? 16) + window.scrollX}px`;
    el.style.top = `${(r?.bottom ?? 16) + window.scrollY + 6}px`;
    this.overlay.root.append(el);
    this.hover = { item, el };
  }

  private closeHover(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.hover?.el.remove();
    this.hover = null;
  }

  private remove(which: (item: Item) => boolean): void {
    for (const item of this.items.filter(which)) item.mark.remove();
    this.items = this.items.filter((item) => !which(item));
  }
}
