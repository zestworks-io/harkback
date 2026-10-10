import { Matcher, MAX_PREVIEW_PAGE_CHARS, type Hit, type MatcherEntry } from "@harkback/core";
import type { ExplainRequestMsg } from "../explain/explain";
import { contextForRange, extractPage, rangeFor, type ExtractedPage, type SelectionContext } from "../source/extract";
import { h } from "../ui/dom";
import type { PageInfo, PortIn, PortOut, PrivacyFields } from "../messaging/messages";
import type { PreviewTerm } from "../explain/preview";
import type { ReunionCard } from "../records/reunion-cards";
import type { Choice } from "../source/privacy-gate";
import { profileFor, type Privacy } from "../source/site-profiles";
import { detectSource, type DetectedSource } from "../source/source-id";
import { ExplainCard } from "../ui/explain-card";
import { createOverlay, placeNear, type Overlay } from "../ui/overlay";
import { LockChip } from "../ui/lock-chip";
import { PreviewPanel } from "../ui/preview-panel";
import { ReunionLayer, type ReunionAction } from "../ui/reunion-layer";
import { t, useStrings, type Lang } from "../ui/strings";
import type { PortLike, Rpc } from "./rpc";

const MAX_SELECTION = 200;
const PING_MS = 20_000;
const PREVIEW_CONTEXT_CHARS = 400;
/** Screens of captions whose reunion cards are kept; a long video has many. */
const MAX_CACHED_SCREENS = 200;

export interface ExplainOptions {
  mode: ExplainRequestMsg["mode"];
  earlierEncounterId?: string;
  conceptId?: string;
  /** The reader chose this model after a failure. */
  modelId?: string;
  /** The selected text, kept for a retry: a caption line may be gone from the page, and its Range with it. */
  text?: string;
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

/** A source whose text changes under the reader's eyes, such as the captions of a video. */
export interface LiveSource {
  /** Whether live text is on screen now (a video page) or the page is to be read like any other. */
  active(): boolean;
  /** What is on screen now. */
  page(): ExtractedPage;
  /** Calls `onSettled` when the text has stopped changing and `onReset` when another document opens. Returns a function that stops. */
  watch(onSettled: () => void, onReset: () => void): () => void;
  /** The text around a selection from what has been shown, and where in the document it was. */
  context(selection: string): SelectionContext | null;
  /** Everything shown so far: what a quoted definition is checked against. */
  text(): string;
}

/** Where a page's text and identity come from when it is not an ordinary web page. */
export interface PageSource {
  /** The address that site rules and history refer to. */
  readonly url: string;
  detect(): DetectedSource;
  /** Where the text is; undefined to find it as for any web page. */
  root(): Element | undefined;
  live?: LiveSource;
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
  private previewPanel: PreviewPanel | null = null;
  private rescan: ReturnType<typeof setTimeout> | undefined;
  /** Rebuilt only when the page-info entries change, not on every rescan. */
  private matcher: { entries: MatcherEntry[]; value: Matcher } | null = null;
  private observer: MutationObserver | null = null;
  private watch: ReturnType<typeof setTimeout> | undefined;
  private href = location.href;
  private scanGen = 0;
  /**
   * Reunion cards found for a video, by the set of terms on screen. A caption repeats the same terms often, and the choice of
   * cards (page limit, ambiguous abbreviations that need a corroborating term) depends on all the terms together, so a screen
   * is asked about as a whole.
   */
  private readonly reunions = new Map<string, { key: string; card: ReunionCard }[]>();
  /** Concepts the reader has answered for on this video; not shown again on it. */
  private readonly answered = new Set<string>();
  /** What the reader chose about pages that looked private, by source, for as long as this page lives. */
  private readonly choices = new Map<string, Choice>();
  private lockChip: LockChip | null = null;
  private lockGen = 0;

  constructor(
    private readonly rpc: Rpc,
    private readonly shadowMode: "open" | "closed",
    private readonly source?: PageSource,
  ) {}

  /** The source's live text, when it has some on screen now. */
  private live(): LiveSource | null {
    const live = this.source?.live;
    return live?.active() ? live : null;
  }

  private extract(): ExtractedPage {
    return this.live()?.page() ?? extractPage(document, this.source?.url ?? location.href, this.source?.root());
  }

  /** What the page suggests about being private and what the reader chose about it; the background decides what to do. */
  private privacyFields(sourceId: string): PrivacyFields {
    const href = this.source?.url ?? location.href;
    let privacy: Privacy = "unknown";
    try {
      privacy = profileFor(href)?.privacy(new URL(href), document) ?? "unknown";
    } catch {
      // The page's address or markup is not usable: nothing is known about it.
    }
    const choice = this.choices.get(sourceId);
    return { privacy, ...(choice ? { choice } : {}) };
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
    return this.info?.language ?? "en";
  }

  private take(info: PageInfo): PageInfo {
    useStrings(info.language, info.strings);
    return info;
  }

  async start(): Promise<void> {
    const info = this.take(await this.rpc.request({ type: "page-info" }));
    if (info.enabled && info.autoScan) await this.activate(info);
    else {
      this.info = info;
      void this.refreshLock();
    }
  }

  /** Shows the lock when the page is sensitive or would be asked about, and hides it otherwise or when that cannot be found out. */
  private async refreshLock(): Promise<void> {
    const gen = ++this.lockGen;
    // What the lock says is about the page in front of the reader: when that is unknown, it says nothing.
    if (!this.info?.enabled) return this.lockChip?.set("normal");
    const source = this.detect();
    let answer: { status?: unknown; byRule?: unknown };
    try {
      answer = await this.rpc.request({ type: "source-status", sourceId: source.source_id, ...this.privacyFields(source.source_id) });
    } catch {
      if (gen === this.lockGen) this.lockChip?.set("normal");
      return;
    }
    if (gen !== this.lockGen) return;
    const status = answer.status;
    if (status !== "sensitive" && status !== "ask" && status !== "normal") return void this.lockChip?.set("normal");
    if (status === "normal" && !this.lockChip) return;
    this.lockChip ??= this.createLock();
    this.lockChip.set(status, answer.byRule === true);
  }

  private createLock(): LockChip {
    const chip = new LockChip(this.lang, {
      onUnmark: () => {
        const source = this.detect();
        // An answer given on this page would otherwise keep it sensitive.
        this.choices.delete(source.source_id);
        void this.rpc
          .request({ type: "mark-normal", sourceId: source.source_id, source })
          .catch(() => undefined)
          .then(() => this.refreshLock());
      },
      onChoose: (choice, remember) => this.applyChoice(this.detect(), choice, remember),
    });
    this.ensureOverlay().root.append(chip.el);
    return chip;
  }

  /** Also the "rescan" action: the toolbar button calls it again. `known` is a page-info answer that is still fresh. */
  async activate(known?: PageInfo): Promise<void> {
    this.info = this.take(known ?? (await this.rpc.request({ type: "page-info" })));
    if (!this.info.enabled) return void this.refreshLock();
    // New page-info means new records: reunions found before no longer hold.
    this.reunions.clear();
    const first = !this.listening;
    if (first) {
      this.listening = true;
      document.addEventListener("mouseup", this.onMouseUp, true);
      document.addEventListener("mousedown", this.onMouseDown, true);
      document.addEventListener("keyup", this.onKeyUp, true);
      document.addEventListener("touchend", this.onTouchEnd, true);
      // Live text tells when it has changed; the page-wide observer would fire on every caption.
      // Watching lasts as long as the page does.
      if (this.source?.live) this.source.live.watch(this.onLiveSettled, this.onLiveReset);
      else this.observe();
    }
    // The first read of live text is started by the watcher itself.
    if (!(first && this.source?.live)) await this.scan();
    void this.refreshLock();
  }

  async scan(): Promise<void> {
    const info = this.info;
    const gen = ++this.scanGen;
    if (this.source?.live && !this.live()) {
      this.layer?.clear();
      return;
    }
    if (!info?.scan || info.entries.length === 0) return;
    // Live text moves on in a few seconds: waiting for an idle moment would show marks on a line that is gone.
    if (!this.live())
      await new Promise<void>((resolve) => {
        if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 2000 });
        else setTimeout(resolve, 50);
      });
    if (gen !== this.scanGen) return;
    const page = this.extract();
    this.page = page;
    const firstPerKey = new Map<string, Hit>();
    if (this.matcher?.entries !== info.entries) this.matcher = { entries: info.entries, value: new Matcher(info.entries) };
    for (const hit of this.matcher.value.scan(page.text)) if (!firstPerKey.has(hit.key)) firstPerKey.set(hit.key, hit);
    if (firstPerKey.size === 0) {
      this.layer?.clear();
      return;
    }
    const sourceId = this.detect().source_id;
    const hits = [...firstPerKey.values()];
    let cards: ReunionCard[];
    if (this.live()) {
      const screen = hits
        .map((hit) => hit.key)
        .sort()
        .join("\u0000");
      let found = this.reunions.get(screen);
      if (!found) {
        const { cards: fresh } = await this.rpc.request({ type: "reunions", sourceId, hits });
        const keyAt = new Map(hits.map((hit) => [`${hit.start}:${hit.end}`, hit.key]));
        found = fresh.flatMap((card) => {
          const key = keyAt.get(`${card.start}:${card.end}`);
          return key === undefined ? [] : [{ key, card }];
        });
        if (this.reunions.size >= MAX_CACHED_SCREENS) this.reunions.clear();
        this.reunions.set(screen, found);
      }
      const hitOf = new Map(hits.map((hit) => [hit.key, hit]));
      cards = found.flatMap(({ key, card }) => {
        const hit = hitOf.get(key);
        // The same terms may stand at other places in the line this time.
        return hit && !this.answered.has(card.conceptId) ? [{ ...card, start: hit.start, end: hit.end, matched: hit.text }] : [];
      });
    } else {
      cards = (await this.rpc.request({ type: "reunions", sourceId, hits })).cards;
    }
    if (gen !== this.scanGen) return;
    this.layer?.clear();
    const entries = cards.flatMap((card) => {
      const range = rangeFor(page, card.start, card.end);
      return range ? [{ card, range }] : [];
    });
    if (entries.length === 0) return;
    this.layer ??= new ReunionLayer(this.ensureOverlay(), this.lang, (card, action, range) => this.onReunionAction(card, action, range));
    this.layer.show(entries);
  }

  /** The caption has held still: read it again. */
  private readonly onLiveSettled = (): void => {
    this.page = null;
    void this.scan().catch(() => undefined);
  };

  /** Another video opened: nothing about the last one applies. */
  private readonly onLiveReset = (): void => {
    this.scanGen++;
    this.endSession();
    this.closePreview();
    this.layer?.clear();
    this.page = null;
    this.reunions.clear();
    this.answered.clear();
    void this.refresh().catch(() => undefined);
  };

  /** Records may have changed since the page opened (a single-page site never reloads): read the page info again. */
  private async refresh(): Promise<void> {
    const info = this.take(await this.rpc.request({ type: "page-info" }));
    if (!info.enabled) return;
    this.info = info;
    this.reunions.clear();
    await this.scan();
  }

  /** Pages change after they load: more text arrives, or a single-page app moves to another document. */
  private observe(): void {
    if (this.observer || typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver((records) => {
      const host = this.overlay?.host;
      if (
        host &&
        records.every((r) => r.target === host || host.contains(r.target) || [...r.addedNodes, ...r.removedNodes].every((n) => n === host))
      )
        return;
      clearTimeout(this.watch);
      this.watch = setTimeout(() => void this.onPageChanged(), 1500);
    });
    this.observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true, characterData: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.changedWhileHidden) void this.onPageChanged();
    });
  }

  /** The page changed while its tab was in the background; it is looked at again when the tab comes back. */
  private changedWhileHidden = false;

  private async onPageChanged(): Promise<void> {
    if (document.hidden) {
      this.changedWhileHidden = true;
      return;
    }
    this.changedWhileHidden = false;
    if (!this.source && location.href !== this.href) {
      // Another page of a single-page app: the rules, the source and the card no longer apply.
      this.href = location.href;
      this.endSession();
      this.closePreview();
      this.layer?.clear();
      this.page = null;
      await this.activate().catch(() => undefined);
      return;
    }
    this.invalidate();
  }

  private onReunionAction(card: ReunionCard, action: ReunionAction, range: Range): void {
    // A term the reader has answered for is not shown again on the same video.
    if (this.source?.live && (action === "recalled" || action === "mute")) this.answered.add(card.conceptId);
    if (action === "recalled") void this.rpc.request({ type: "action", encounterId: card.encounterId, action: "reunion_recalled" });
    else if (action === "mute") void this.rpc.request({ type: "mute", conceptId: card.conceptId });
    else this.explain(range, { mode: action, earlierEncounterId: card.encounterId, conceptId: card.conceptId, text: card.matched });
  }

  /** The toolbar button and its shortcut: offer to scan the page for its key concepts. Nothing is sent until the reader agrees. */
  async offerPreview(): Promise<void> {
    this.info ??= this.take(await this.rpc.request({ type: "page-info" }));
    // A video's captions are only what has been shown so far, so there is no whole page to pick key terms from.
    if (!this.info.enabled || this.previewPanel || this.live()) return;
    const source = this.detect();
    const profile = profileFor(this.source?.url ?? location.href);
    const unreadable = profile?.readable === false;
    const readableUrl = profile?.readableUrl?.();
    const panel: PreviewPanel = new PreviewPanel(this.lang, {
      onScan: () => {
        panel.scanning();
        const page = (this.page ??= this.extract());
        // A long page is read only up to a limit; the reader is told how much was left out.
        const note =
          page.text.length > MAX_PREVIEW_PAGE_CHARS
            ? t(this.lang, "previewCovered", { n: MAX_PREVIEW_PAGE_CHARS, total: page.text.length })
            : "";
        this.rpc
          .request({
            type: "preview-terms",
            sourceId: source.source_id,
            title: source.title,
            text: page.text.slice(0, MAX_PREVIEW_PAGE_CHARS),
            ...this.privacyFields(source.source_id),
          })
          .then(
            (r) => {
              if (this.previewPanel !== panel) return;
              if (r.ok) panel.show(r.terms, note);
              else panel.error(r.code, r.retryAfterMs);
            },
            () => this.previewPanel === panel && panel.error("internal"),
          );
      },
      onExplain: (term: PreviewTerm) => {
        const text = (this.page ??= this.extract()).text;
        // Not `toLowerCase().indexOf`: some letters change length when lower-cased, which would shift the offset.
        const at = new RegExp(term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").exec(text)?.index ?? -1;
        const context = at < 0 ? "" : text.slice(Math.max(0, at - PREVIEW_CONTEXT_CHARS), at + term.term.length + PREVIEW_CONTEXT_CHARS);
        return this.rpc.request({
          type: "preview-explain",
          sourceId: source.source_id,
          title: source.title,
          term: term.term,
          conceptId: term.conceptId,
          context,
          ...this.privacyFields(source.source_id),
        });
      },
      onChoose: (choice, remember) => {
        this.applyChoice(source, choice, remember);
        if (this.previewPanel === panel) this.planPreview(panel, source);
      },
      onClose: () => this.closePreview(),
      ...(readableUrl ? { onOpenReadable: () => void window.open(readableUrl, "_blank", "noopener") } : {}),
    });
    this.previewPanel = panel;
    this.ensureOverlay().root.append(panel.el);
    if (unreadable) panel.unavailable("unreadable_page");
    else this.planPreview(panel, source);
  }

  private planPreview(panel: PreviewPanel, source: DetectedSource): void {
    this.rpc.request({ type: "preview-plan", sourceId: source.source_id, ...this.privacyFields(source.source_id) }).then(
      (r) => {
        if (this.previewPanel !== panel) return;
        if (r.ok) panel.offer(r);
        else panel.unavailable(r.code, r.retryAfterMs);
      },
      () => this.previewPanel === panel && panel.unavailable("internal"),
    );
  }

  /** Remembers the reader's answer for this page and, outside a private window, records it. */
  private applyChoice(source: DetectedSource, choice: Choice, remember: boolean): void {
    this.choices.set(source.source_id, choice);
    // A private window records nothing; the answer then holds for this page only.
    if (this.info?.incognito) return void this.refreshLock();
    const writes = [this.rpc.request(choice === "local" ? { type: "mark-sensitive", source } : { type: "choose-normal", source })];
    if (remember) writes.push(this.rpc.request({ type: "remember-site", sensitive: choice === "local" }));
    // The lock reads what was just written.
    void Promise.allSettled(writes).then(() => this.refreshLock());
  }

  private closePreview(): void {
    this.previewPanel?.close();
    this.previewPanel = null;
  }

  async explainSelection(): Promise<void> {
    // Nothing is selectable in a page that draws its text; say why, and where the document can be read, instead of staying silent.
    if (profileFor(this.source?.url ?? location.href)?.readable === false) return this.offerPreview();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    // The first press scans the page like the toolbar button; later presses reuse that scan.
    if (!this.listening) await this.activate();
    if (this.info?.enabled) this.explain(range, { mode: "explain" });
  }

  explain(range: Range, opts: ExplainOptions): void {
    // A page that draws its text has nothing of the document to read; what is selected there is its menus.
    if (profileFor(this.source?.url ?? location.href)?.readable === false) return;
    const page = (this.page ??= this.extract());
    const live = this.live();
    // Selected in the captions, or elsewhere on the page (the description, a comment): the latter is read like any page.
    const ctx = (live ? live.context(opts.text ?? range.toString()) : null) ?? contextForRange(page, range);
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
      pageText: live ? live.text() : page.text,
      locator: ctx.locator,
      source,
      ...(opts.earlierEncounterId ? { earlierEncounterId: opts.earlierEncounterId } : {}),
      ...(opts.conceptId ? { conceptId: opts.conceptId } : {}),
      ...(opts.modelId ? { modelId: opts.modelId } : {}),
      ...this.privacyFields(source.source_id),
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
      card: new ExplainCard(
        this.lang,
        {
          onAnswer: (sameConcept) => send({ type: "answer", sameConcept }),
          onAction: (action) => {
            if (session.encounterId) void this.rpc.request({ type: "action", encounterId: session.encounterId, action });
          },
          onFollowUp: (question) => send({ type: "followup", question }),
          onMarkSensitive: () =>
            void this.rpc
              .request({ type: "mark-sensitive", source })
              .catch(() => undefined)
              .then(() => this.refreshLock()),
          onChoose: (choice, remember) => {
            this.applyChoice(source, choice, remember);
            if (this.session !== session) return;
            this.endSession();
            this.explain(range, { ...opts, text: ctx.selection });
          },
          onRetry: () => {
            if (this.session !== session) return;
            this.endSession();
            this.explain(range, { ...opts, text: ctx.selection });
          },
          onRetryWith: (modelId) => {
            if (this.session !== session) return;
            this.endSession();
            this.explain(range, { ...opts, text: ctx.selection, modelId });
          },
          onCancel: () => send({ type: "cancel" }),
          onClose: () => {
            if (this.session === session) this.endSession();
          },
        },
        this.info?.models ?? [],
      ),
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
        s.card.done(m.recorded, m.sensitive);
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
        if (m.code === "needs_choice") s.card.choose();
        else s.card.error(m.code, m.retryAfterMs);
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

  /** A selection made with the keyboard (Shift + arrows, Select All). */
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (!e.isTrusted || this.isOwn(e)) return;
    if (
      e.key === "Shift" ||
      e.key.startsWith("Arrow") ||
      e.key === "Home" ||
      e.key === "End" ||
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a")
    ) {
      setTimeout(() => this.showTrigger(), 0);
    }
  };

  /** A selection made by touch settles a moment after the finger lifts. */
  private readonly onTouchEnd = (e: TouchEvent): void => {
    if (!e.isTrusted || this.isOwn(e)) return;
    setTimeout(() => this.showTrigger(), 350);
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
