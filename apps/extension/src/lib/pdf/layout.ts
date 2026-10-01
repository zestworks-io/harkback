/** One run of text as a PDF places it: y grows upwards and `h` is the font size. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfParagraph {
  /** Indices into the input, in reading order; blank items inside the paragraph stay in it. */
  items: number[];
  heading: boolean;
}

export interface PdfLayout {
  paragraphs: PdfParagraph[];
  /** Items whose trailing hyphen only marks a line break inside a word. */
  hyphenated: number[];
  /** Items that need a space after them: at the end of a line, or before a gap between words. */
  spaceAfter: number[];
}

interface Line {
  items: number[];
  x: number;
  y: number;
  h: number;
  right: number;
  column: number;
}

const BLANK = /^\s*$/;
const SAME_LINE = 0.5;
const GAP_SPACE = 0.15;
const PARAGRAPH_GAP = 1.55;
const INDENT_MIN = 0.7;
const INDENT_MAX = 3.5;
const SHORT_LAST_LINE = 0.35;
const SIZE_CHANGE = 0.1;
const HEADING_SIZE = 1.12;
const HEADING_MAX_CHARS = 150;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Text items come in the order the PDF draws them, which for most documents is reading order, one column after another. */
function buildLines(items: PdfTextItem[]): Line[] {
  const lines: Line[] = [];
  let column = 0;
  items.forEach((item, i) => {
    if (BLANK.test(item.str)) return;
    const prev = lines[lines.length - 1];
    if (prev && Math.abs(item.y - prev.y) <= SAME_LINE * prev.h && item.x >= prev.right - 0.3 * prev.h) {
      prev.items.push(i);
      prev.right = Math.max(prev.right, item.x + item.w);
      prev.h = Math.max(prev.h, item.h);
      return;
    }
    // Jumping back up the page means the next column starts.
    if (prev && item.y > prev.y + SAME_LINE * prev.h) column++;
    lines.push({ items: [i], x: item.x, y: item.y, h: item.h, right: item.x + item.w, column });
  });
  return lines;
}

function endsInBreakHyphen(last: string, next: string): boolean {
  return /\p{L}-$/u.test(last) && /^\p{Ll}/u.test(next);
}

export function groupParagraphs(items: PdfTextItem[]): PdfLayout {
  const lines = buildLines(items);
  if (lines.length === 0) return { paragraphs: [], hyphenated: [], spaceAfter: [] };

  const bodyH = median(lines.map((l) => l.h));
  const extent = new Map<number, { left: number; right: number }>();
  for (const l of lines) {
    const e = extent.get(l.column) ?? { left: l.x, right: l.right };
    extent.set(l.column, { left: Math.min(e.left, l.x), right: Math.max(e.right, l.right) });
  }

  const groups: Line[][] = [[lines[0]!]];
  let paraLeft = lines[0]!.x;
  for (let k = 1; k < lines.length; k++) {
    const prev = lines[k - 1]!;
    const cur = lines[k]!;
    const col = extent.get(prev.column)!;
    const indent = cur.x - paraLeft;
    const breaks =
      cur.column !== prev.column ||
      prev.y - cur.y > PARAGRAPH_GAP * Math.max(prev.h, cur.h) ||
      Math.abs(cur.h - prev.h) > SIZE_CHANGE * Math.min(prev.h, cur.h) ||
      (indent > INDENT_MIN * bodyH && indent < INDENT_MAX * bodyH) ||
      col.right - prev.right > SHORT_LAST_LINE * (col.right - col.left);
    if (breaks) {
      groups.push([cur]);
      paraLeft = cur.x;
    } else {
      groups[groups.length - 1]!.push(cur);
      paraLeft = Math.min(paraLeft, cur.x);
    }
  }

  const hyphenated: number[] = [];
  const spaceAfter: number[] = [];
  const paragraphs: PdfParagraph[] = groups.map((group) => {
    const chars = group.reduce((n, l) => n + l.items.reduce((m, i) => m + items[i]!.str.length, 0), 0);
    const size = Math.max(...group.map((l) => l.h));
    group.forEach((line, k) => {
      const last = line.items[line.items.length - 1]!;
      const next = group[k + 1]?.items[0];
      if (next !== undefined) {
        if (endsInBreakHyphen(items[last]!.str, items[next]!.str)) hyphenated.push(last);
        else if (!/\s$/.test(items[last]!.str) && !/^\s/.test(items[next]!.str)) spaceAfter.push(last);
      }
      line.items.slice(1).forEach((b, j) => {
        const a = line.items[j]!;
        const gap = items[b]!.x - (items[a]!.x + items[a]!.w);
        if (b === a + 1 && gap > GAP_SPACE * line.h && !/\s$/.test(items[a]!.str) && !/^\s/.test(items[b]!.str)) spaceAfter.push(a);
      });
    });
    return {
      items: [],
      heading: group.length <= 2 && chars < HEADING_MAX_CHARS && size > HEADING_SIZE * bodyH,
    };
  });

  // Blank items follow the paragraph of the text item before them; ones before any text are dropped.
  const owner = new Map<number, number>();
  groups.forEach((group, p) => group.forEach((l) => l.items.forEach((i) => owner.set(i, p))));
  let current = -1;
  items.forEach((_, i) => {
    current = owner.get(i) ?? current;
    if (current >= 0) paragraphs[current]!.items.push(i);
  });

  spaceAfter.sort((a, b) => a - b);
  hyphenated.sort((a, b) => a - b);
  return { paragraphs, hyphenated, spaceAfter };
}
