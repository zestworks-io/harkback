import type { Block, ExtractedPage, Segment, SelectionContext } from "../source/extract";
import { CaptionBuffer } from "./caption-buffer";
import { allowCaptionSelection, setSelectable } from "./caption-select";
import { isWatchPage, videoIdFromUrl } from "./youtube";

/** Everything that depends on how YouTube builds its page is here. When the player changes, this is the file to update. */
export const SELECTORS = {
  player: "#movie_player",
  captionWindow: ".ytp-caption-window-container",
  line: ".caption-visual-line",
  segment: ".ytp-caption-segment",
  video: "video",
} as const;

/** The caption must hold still this long before it is read: auto-captions are written word by word. */
export const SETTLE_MS = 250;
/** ...but is read at the latest this long after it first changed, so a long run of words still gets underlined. */
export const MAX_WAIT_MS = 1000;
const POLL_MS = 1000;
/** After another video opens, the page title may still be the last video's for a moment. */
const TITLE_WAIT_MS = 5000;
/** Polls with the video known but the caption window missing before saying so once in the console. */
const MISSING_POLLS = 10;

function titleOf(doc: Document): string {
  return doc.title.replace(/^\(\d+\)\s+/, "").replace(/\s+-\s+YouTube$/, "");
}

/** Reads the captions YouTube draws over a video and keeps what has been shown. */
export class CaptionTracker {
  readonly buffer = new CaptionBuffer();
  private videoId: string | null = null;
  private container: Element | null = null;
  private observer: MutationObserver | null = null;
  private releaseSelection: (() => void) | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstChange: number | null = null;
  private missing = 0;
  private lastTitle = "";
  private titleBefore: string | null = null;
  private navigatedAt = 0;
  private reported = false;
  private onSettled: () => void = () => undefined;
  private onReset: () => void = () => undefined;

  constructor(
    private readonly doc: Document,
    private readonly address: () => string = () => doc.location.href,
  ) {}

  /** The video on screen, or null when the page is not a watch page. */
  currentVideoId(): string | null {
    const url = this.address();
    return isWatchPage(url) ? videoIdFromUrl(url) : null;
  }

  active(): boolean {
    return this.currentVideoId() !== null;
  }

  /** The video's title; empty for a few seconds after another video opens if the page has not yet changed its own. */
  title(): string {
    const title = titleOf(this.doc);
    return this.titleBefore !== null && title === this.titleBefore && Date.now() - this.navigatedAt < TITLE_WAIT_MS ? "" : title;
  }

  /** Playback position in whole seconds. */
  currentTime(): number {
    const t = this.videoElement()?.currentTime;
    return typeof t === "number" && Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
  }

  /** Starts reading. `onSettled` runs when the caption has stopped changing (or the video was paused); `onReset` when another video opens. Returns a function that stops. */
  watch(onSettled: () => void, onReset: () => void): () => void {
    this.onSettled = onSettled;
    this.onReset = onReset;
    this.videoId = this.currentVideoId();
    const poll = setInterval(() => this.poll(), POLL_MS);
    this.poll();
    return () => {
      clearInterval(poll);
      clearTimeout(this.timer);
      this.observer?.disconnect();
      this.observer = null;
      this.releaseSelection?.();
      this.releaseSelection = null;
      this.container = null;
      this.detachVideo();
    };
  }

  /** What is on screen now as a page: one block per caption line, lines apart from each other. */
  page(): ExtractedPage {
    const container = this.doc.querySelector(SELECTORS.captionWindow);
    const lines = container ? this.lineElements(container) : [];
    let text = "";
    const segments: Segment[] = [];
    const blocks: Block[] = [];
    for (const el of lines) {
      const walker = this.doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
      const start = text.length + (text ? 1 : 0);
      let own = "";
      const mine: Segment[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const data = (n as Text).data;
        if (!data) continue;
        mine.push({ node: n, start: start + own.length, end: start + own.length + data.length });
        own += data;
      }
      if (!/\S/.test(own)) continue;
      if (text) text += "\n";
      text += own;
      segments.push(...mine);
      blocks.push({ id: `b${blocks.length}`, el, start, end: start + own.length, section: "" });
    }
    return { root: container ?? this.doc.body, text, segments, blocks, abstractFirstSentence: "" };
  }

  /** Everything shown so far, including what is on screen now; what a quoted definition is checked against. */
  text(): string {
    this.record();
    return this.buffer.text();
  }

  /** The text around a selection from what has been shown, or null when it was never on screen. */
  context(selection: string): SelectionContext | null {
    this.record();
    const found = this.buffer.context(selection);
    if (!found) return null;
    const exact = found.matched;
    return {
      selection: exact,
      paragraph: found.paragraph,
      paragraphId: `${this.videoId ?? "video"}:${found.t}`,
      section: "",
      locator: { exact: exact.slice(0, 500), prefix: found.prefix, suffix: found.suffix, t: found.t },
    };
  }

  private videoElement(): HTMLVideoElement | null {
    const player = this.doc.querySelector(SELECTORS.player);
    return (player ?? this.doc).querySelector<HTMLVideoElement>(SELECTORS.video);
  }

  private lineElements(container: Element): Element[] {
    const lines = [...container.querySelectorAll(SELECTORS.line)];
    return lines.length > 0 ? lines : [...container.querySelectorAll(SELECTORS.segment)];
  }

  /** Puts the lines on screen into the buffer. */
  private record(): void {
    this.syncVideo();
    const container = this.doc.querySelector(SELECTORS.captionWindow);
    if (!container || !this.active()) return;
    this.buffer.add(
      this.currentTime(),
      this.lineElements(container).map((el) => el.textContent ?? ""),
    );
  }

  /** Another video (or none) is open: what was read from the last one is no longer this video's. Returns the video now open. */
  private syncVideo(): string | null {
    const id = this.currentVideoId();
    if (id !== this.videoId) {
      this.videoId = id;
      this.titleBefore = this.lastTitle;
      this.navigatedAt = Date.now();
      this.buffer.clear();
      this.missing = 0;
      this.reported = false;
      clearTimeout(this.timer);
      this.firstChange = null;
      this.onReset();
    }
    return id;
  }

  private poll(): void {
    // Nobody is watching a hidden tab; reading resumes when it is shown again.
    if (this.doc.hidden) return;
    const id = this.syncVideo();
    if (id) this.lastTitle = titleOf(this.doc);
    if (!id) {
      this.attach(null);
      return;
    }
    const container = this.doc.querySelector(SELECTORS.captionWindow);
    if (container !== this.container) {
      this.attach(container);
      // Captions turned on or off, or the player redrew them: read what is there now, or clear what is gone.
      this.flush();
    }
    this.attachVideo();
    if (container) this.missing = 0;
    else if (++this.missing === MISSING_POLLS && !this.reported) {
      this.reported = true;
      const what = this.doc.querySelector(SELECTORS.player) ? SELECTORS.captionWindow : SELECTORS.player;
      // The one line this extension writes to a console, at debug level: it names what to fix when YouTube changes its page.
      // eslint-disable-next-line no-console
      console.debug(`[harkback] no captions read: ${what} not found (captions may be off)`);
    }
  }

  private attach(container: Element | null): void {
    this.observer?.disconnect();
    this.observer = null;
    this.releaseSelection?.();
    this.releaseSelection = null;
    this.container = container;
    if (container) {
      this.releaseSelection = allowCaptionSelection(
        this.doc,
        container,
        SELECTORS.captionWindow,
        () => this.videoElement()?.paused === true,
      );
      setSelectable(container, this.videoElement()?.paused === true);
    }
    if (!container || typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver(() => this.touch());
    this.observer.observe(container, { childList: true, subtree: true, characterData: true });
  }

  private readonly onPause = (): void => {
    setSelectable(this.container, true);
    this.flush();
  };
  private readonly onPlay = (): void => setSelectable(this.container, false);
  private readonly onSeeked = (): void => this.touch();

  private attachVideo(): void {
    const video = this.videoElement();
    if (video === this.video) return;
    this.detachVideo();
    this.video = video;
    video?.addEventListener("pause", this.onPause);
    video?.addEventListener("play", this.onPlay);
    video?.addEventListener("seeked", this.onSeeked);
  }

  private detachVideo(): void {
    this.video?.removeEventListener("pause", this.onPause);
    this.video?.removeEventListener("play", this.onPlay);
    this.video?.removeEventListener("seeked", this.onSeeked);
    this.video = null;
  }

  /** The caption changed: read it once it has held still, but not later than `MAX_WAIT_MS` after it first changed. */
  private touch(): void {
    const now = Date.now();
    this.firstChange ??= now;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), Math.min(SETTLE_MS, Math.max(0, MAX_WAIT_MS - (now - this.firstChange))));
  }

  private flush(): void {
    clearTimeout(this.timer);
    this.firstChange = null;
    if (!this.active()) return;
    this.record();
    this.onSettled();
  }
}
