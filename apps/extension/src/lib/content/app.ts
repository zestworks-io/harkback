import { Matcher, type Hit } from "@harkback/core";
import type { ExplainRequestMsg } from "../explain";
import { contextForRange, extractPage, rangeFor, type ExtractedPage } from "../extract";
import { h } from "../dom";
import type { PageInfo, PortIn, PortOut } from "../messages";
import type { ReunionCard } from "../reunion-cards";
import { detectSource, type DetectedSource } from "../source-id";
import { ExplainCard } from "../ui/explain-card";
import { createOverlay, placeNear, type Overlay } from "../ui/overlay";
import { ReunionLayer, type ReunionAction } from "../ui/reunion-layer";
import { t, useStrings, type Lang } from "../ui/strings";
import type { PortLike, Rpc } from "./rpc";

const MAX_SELECTION = 200;
const PING_MS = 20_000;

export interface ExplainOptions {
  mode: ExplainRequestMsg["mode"];
  earlierEncounterId?: string;
  conceptId?: string;
}

interface Session {
  key: string;
  card: ExplainCard;
  port: PortLike;
  ping: ReturnType<typeof setInterval>;
  encounterId: string | null;
  finished: boolean;
}

function lastRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  const r = rects.length > 0 ? rects[rects.length - 1]! : range.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : r;
}

/** Where a page's text and identity come from when it is not an ordinary web page. */
export interface PageSource {
  /** The address that site rules and history refer to. */
  url: string;
  detect(): DetectedSource;
  root(): Element;
}

export class ContentApp {
  private info: PageInfo | null = null;
  private page: ExtractedPage | null = null;
  private overlay: Overlay | null = null;
  private listening = false;
  private trigger: HTMLButtonElement | null = null;
  private triggerRange: Range | null = null;
  private session: Session | null = null;
  private layer: ReunionLayer | null = null;
  private rescan: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly rpc: Rpc,
    private readonly shadowMode: "open" | "closed",
    private readonly source?: PageSource,
  ) {}

  private extract(): ExtractedPage {
    return extractPage(document, this.source?.url ?? location.href, this.source?.root());
  }

  private detect(): DetectedSource {
    return this.source?.detect() ?? detectSource(location.href, document);
  }

  /** The page text changed (more of a PDF was drawn): read it again before the next use, and refresh the reunion marks. */
  invalidate(): void {
    this.page = null;
    if (!this.listening) return;
    clearTimeout(this.rescan);
    this.rescan = setTimeout(() => void this.scan().catch(() => undefined), 400);
  }

  private get lang(): Lang {
    return this.info?.language ?? "zh";
  }

  private take(info: PageInfo): PageInfo {
    useStrings(info.language, info.strings);
    return info;
  }

  async start(): Promise<void> {
    const info = this.take(await this.rpc.request({ type: "page-info" }));
    if (info.enabled && info.autoScan) await this.activate(info);
    else this.info = info;
  }

  /** Also the "rescan" action: the toolbar button calls it again. `known` is a page-info answer that is still fresh. */
  async activate(known?: PageInfo): Promise<void> {
    this.info = this.take(known ?? (await this.rpc.request({ type: "page-info" })));
    if (!this.info.enabled) return;
    if (!this.listening) {
      this.listening = true;
      document.addEventListener("mouseup", this.onMouseUp, true);
      document.addEventListener("mousedown", this.onMouseDown, true);
    }
    await this.scan();
  }

  async scan(): Promise<void> {
    const info = this.info;
    if (!info?.scan || info.entries.length === 0) return;
    await new Promise<void>((resolve) => {
      if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 2000 });
      else setTimeout(resolve, 50);
    });
    const page = this.extract();
    this.page = page;
    const firstPerKey = new Map<string, Hit>();
    for (const hit of new Matcher(info.entries).scan(page.text)) if (!firstPerKey.has(hit.key)) firstPerKey.set(hit.key, hit);
    this.layer?.clear();
    if (firstPerKey.size === 0) return;
    const { cards } = await this.rpc.request({
      type: "reunions",
      sourceId: this.detect().source_id,
      hits: [...firstPerKey.values()],
    });
    const entries = cards.flatMap((card) => {
      const range = rangeFor(page, card.start, card.end);
      return range ? [{ card, range }] : [];
    });
    if (entries.length === 0) return;
    this.layer ??= new ReunionLayer(this.ensureOverlay(), this.lang, (card, action, range) => this.onReunionAction(card, action, range));
    this.layer.show(entries);
  }

  private onReunionAction(card: ReunionCard, action: ReunionAction, range: Range): void {
    if (action === "recalled") void this.rpc.request({ type: "action", encounterId: card.encounterId, action: "reunion_recalled" });
    else if (action === "mute") void this.rpc.request({ type: "mute", conceptId: card.conceptId });
    else this.explain(range, { mode: action, earlierEncounterId: card.encounterId, conceptId: card.conceptId });
  }

  async explainSelection(): Promise<void> {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    // The first press scans the page like the toolbar button; later presses reuse that scan.
    if (!this.listening) await this.activate();
    if (this.info?.enabled) this.explain(range, { mode: "explain" });
  }

  explain(range: Range, opts: ExplainOptions): void {
    const page = (this.page ??= this.extract());
    const ctx = contextForRange(page, range);
    if (!ctx) return;
    const selection = ctx.selection.slice(0, MAX_SELECTION);
    const key = `${opts.mode}\u0000${selection}\u0000${ctx.paragraphId}`;
    // A second click or shortcut press for the same selection while its card is open.
    if (this.session?.key === key) return;
    this.endSession();

    const source = this.detect();
    const request: ExplainRequestMsg = {
      mode: opts.mode,
      selection,
      paragraph: ctx.paragraph,
      paragraphId: ctx.paragraphId,
      section: ctx.section,
      pageTitle: source.title,
      abstractFirstSentence: page.abstractFirstSentence,
      pageText: page.text,
      locator: ctx.locator,
      source,
      ...(opts.earlierEncounterId ? { earlierEncounterId: opts.earlierEncounterId } : {}),
      ...(opts.conceptId ? { conceptId: opts.conceptId } : {}),
    };

    const port = this.rpc.connect();
    const send = (m: PortIn) => {
      try {
        port.postMessage(m);
      } catch {
        // The port is already closed.
      }
    };
    const session: Session = {
      key,
      port,
      encounterId: null,
      finished: false,
      ping: setInterval(() => send({ type: "ping" }), PING_MS),
      card: new ExplainCard(this.lang, {
        onAnswer: (sameConcept) => send({ type: "answer", sameConcept }),
        onAction: (action) => {
          if (session.encounterId) void this.rpc.request({ type: "action", encounterId: session.encounterId, action });
        },
        onFollowUp: (question) => send({ type: "followup", question }),
        onMarkSensitive: () => void this.rpc.request({ type: "mark-sensitive", source }),
        onRetry: () => {
          if (this.session !== session) return;
          this.endSession();
          this.explain(range, opts);
        },
        onClose: () => {
          if (this.session === session) this.endSession();
        },
      }),
    };
    this.session = session;
    placeNear(session.card.el, lastRect(range));
    this.ensureOverlay().root.append(session.card.el);
    port.onMessage.addListener((m) => this.onPortMessage(session, m));
    port.onDisconnect.addListener(() => {
      clearInterval(session.ping);
      if (this.session === session && !session.finished) session.card.error("internal");
    });
    send({ type: "start", request });
  }

  private onPortMessage(s: Session, m: PortOut): void {
    switch (m.type) {
      case "delta":
        s.card.setStreaming(m.text);
        break;
      case "explained":
        s.card.setExplained(m.explanation, m.tier);
        break;
      case "ask":
        s.card.ask(m.name, m.daysAgo);
        break;
      case "done":
        s.finished = true;
        s.encounterId = m.encounterId;
        s.card.done(m.recorded);
        break;
      case "followup_delta":
        s.card.followUpDelta(m.text);
        break;
      case "followup_done":
        s.card.followUpDone(m.answer);
        break;
      case "followup_error":
        s.card.followUpError(m.code, m.retryAfterMs);
        break;
      case "error":
        s.finished = true;
        s.card.error(m.code, m.retryAfterMs);
        break;
    }
  }

  private endSession(): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    // Close the card first: an open "same concept?" question sends its answer on the port.
    s.card.close();
    clearInterval(s.ping);
    s.port.disconnect();
  }

  private ensureOverlay(): Overlay {
    this.overlay ??= createOverlay(this.shadowMode);
    this.overlay.host.setAttribute("data-theme", this.info?.theme ?? "system");
    return this.overlay;
  }

  private isOwn(e: Event): boolean {
    return this.overlay !== null && e.composedPath().includes(this.overlay.host);
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.isOwn(e)) this.hideTrigger();
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (!e.isTrusted || this.isOwn(e)) return;
    // The selection is final only after this mouseup has been handled.
    setTimeout(() => this.showTrigger(), 0);
  };

  private showTrigger(): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const text = sel.toString().trim();
    if (!text || text.length > MAX_SELECTION) return;
    const range = sel.getRangeAt(0).cloneRange();
    const rect = lastRect(range);
    if (!rect) return;
    this.hideTrigger();
    const button = h("button", { className: "hb-trigger", type: "button", "data-hb": "explain-button" }, t(this.lang, "explain"));
    // Keep the page selection: pressing the button must not collapse it.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      const r = this.triggerRange;
      this.hideTrigger();
      if (r) this.explain(r, { mode: "explain" });
    });
    button.style.left = `${rect.right + window.scrollX + 4}px`;
    button.style.top = `${rect.bottom + window.scrollY + 4}px`;
    this.ensureOverlay().root.append(button);
    this.trigger = button;
    this.triggerRange = range;
  }

  private hideTrigger(): void {
    this.trigger?.remove();
    this.trigger = null;
    this.triggerRange = null;
  }
}
