const MAX_CHARS = 4000;
const WINDOW_CHARS = 2000;
const CONTEXT_CHARS = 64;
/** A line shown again within this many seconds (a caption redrawn, or a line that scrolled up) is the same line. */
const SAME_LINE_SECONDS = 15;
/** Auto-captions add words to a line within a second or two; a longer pause starts a new line. */
const GROW_SECONDS = 4;
const RECENT_LINES = 8;

export interface BufferedLine {
  /** Playback position in whole seconds when the line was shown. */
  t: number;
  text: string;
}

export interface CaptionContext {
  /** The selection as it stands in the captions: lines joined by a space, even where the selection ran across a line break. */
  matched: string;
  paragraph: string;
  prefix: string;
  suffix: string;
  /** Playback position of the line the selection is in. */
  t: number;
}

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * The last place `needle` stands in `text`, without regard to case and to where the whitespace is: a selection that ran across
 * two caption lines has no space at the break. Searching with a pattern keeps the offsets in `text` itself; lower-casing a
 * copy would shift them for letters whose lower case is longer.
 */
function lastMatch(text: string, needle: string): { start: number; end: number } | null {
  const chars = Array.from(needle.replace(/\s+/g, ""));
  if (chars.length === 0) return null;
  const pattern = new RegExp(chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "giu");
  let last: RegExpMatchArray | null = null;
  for (const m of text.matchAll(pattern)) last = m;
  return last ? { start: last.index!, end: last.index! + last[0].length } : null;
}

/**
 * The caption lines the reader has seen, oldest first. It is the "page" a video has: context for an explanation and the
 * text a quoted definition is checked against. Only what was shown is kept; nothing is fetched.
 */
export class CaptionBuffer {
  private lines: BufferedLine[] = [];

  /** Records the lines on screen at playback position `t`. Lines already seen are skipped, and a line that grows (auto-captions) replaces its shorter self. */
  add(t: number, shown: readonly string[]): void {
    const at = Math.max(0, Math.floor(t));
    for (const raw of shown) {
      const text = norm(raw);
      if (!text) continue;
      const recent = this.lines.slice(-RECENT_LINES);
      if (recent.some((l) => l.text === text && Math.abs(l.t - at) <= SAME_LINE_SECONDS)) continue;
      const last = this.lines[this.lines.length - 1];
      // The last line with more words after it: the same line, still being written. Anything else is a line of its own.
      if (last && Math.abs(last.t - at) <= GROW_SECONDS && text.startsWith(`${last.text} `)) {
        this.lines[this.lines.length - 1] = { t: last.t, text };
        continue;
      }
      this.lines.push({ t: at, text });
    }
    this.trim();
  }

  clear(): void {
    this.lines = [];
  }

  get size(): number {
    return this.lines.length;
  }

  /** Everything buffered, lines separated by a space. */
  text(): string {
    return this.lines.map((l) => l.text).join(" ");
  }

  /** The text around the most recent occurrence of `selection`, or null when it was never shown. */
  context(selection: string): CaptionContext | null {
    const needle = norm(selection);
    if (!needle) return null;
    const starts: number[] = [];
    let text = "";
    for (const l of this.lines) {
      if (text) text += " ";
      starts.push(text.length);
      text += l.text;
    }
    const found = lastMatch(text, needle);
    if (!found) return null;
    const { start: at, end } = found;
    const room = Math.max(0, WINDOW_CHARS - (end - at));
    const from = Math.min(Math.max(0, at - Math.floor(room / 2)), Math.max(0, text.length - WINDOW_CHARS));
    const paragraph = text.slice(from, from + WINDOW_CHARS);
    let index = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i]! <= at) index = i;
    return {
      matched: text.slice(at, end),
      paragraph,
      prefix: norm(text.slice(Math.max(0, at - CONTEXT_CHARS), at)).slice(-CONTEXT_CHARS),
      suffix: norm(text.slice(end, end + CONTEXT_CHARS)).slice(0, CONTEXT_CHARS),
      t: this.lines[index]!.t,
    };
  }

  private trim(): void {
    let total = this.lines.reduce((n, l) => n + l.text.length + 1, 0);
    while (total > MAX_CHARS && this.lines.length > 1) total -= this.lines.shift()!.text.length + 1;
  }
}
