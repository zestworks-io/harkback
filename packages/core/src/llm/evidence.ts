import { THRESHOLDS } from "../constants";

const DASH = /[-‐‑‒–—]/;
const MARK = /\p{M}/u;

/**
 * Text as evidence is compared: NFKC, lower case, no soft hyphens, dashes and runs of white space as one space, no space
 * at the start. A character is normalised together with the accents that follow it, so a decomposed "é" matches a
 * composed one. `start` and `end` give, for each character kept, the part of the original text it came from.
 */
function normalizeWithMap(s: string): { text: string; start: number[]; end: number[] } {
  let text = "";
  const start: number[] = [];
  const end: number[] = [];
  let space = true; // a leading space is dropped
  for (let i = 0; i < s.length;) {
    let unit = String.fromCodePoint(s.codePointAt(i)!);
    while (i + unit.length < s.length) {
      const next = String.fromCodePoint(s.codePointAt(i + unit.length)!);
      if (!MARK.test(next)) break;
      unit += next;
    }
    for (const c of unit.normalize("NFKC").toLowerCase()) {
      if (c === "­") continue;
      if (/\s/.test(c) || DASH.test(c)) {
        if (space) continue;
        space = true;
        text += " ";
      } else {
        space = false;
        text += c;
      }
      start.push(i);
      end.push(i + unit.length);
    }
    i += unit.length;
  }
  return { text, start, end };
}

const normalizeForEvidence = (s: string): string => normalizeWithMap(s).text.trimEnd();

function trigramSet(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Sellers' algorithm: the best alignment of `pattern` against any substring of `text`, and where in `text` it ends. */
function bestAlignment(pattern: string, text: string): { score: number; end: number } {
  const m = pattern.length;
  if (m === 0) return { score: 0, end: 0 };
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let cur = new Array<number>(m + 1);
  let best = prev[m]!;
  let end = 0;
  for (let j = 1; j <= text.length; j++) {
    cur[0] = 0;
    const tc = text[j - 1];
    for (let i = 1; i <= m; i++) {
      const cost = pattern[i - 1] === tc ? 0 : 1;
      cur[i] = Math.min(prev[i]! + 1, cur[i - 1]! + 1, prev[i - 1]! + cost);
    }
    if (cur[m]! < best) {
      best = cur[m]!;
      end = j;
    }
    [prev, cur] = [cur, prev];
  }
  return { score: 1 - best / m, end };
}

/** How well `pattern` matches the best substring of `text`, from 0 to 1. */
export function approxSubstringSimilarity(pattern: string, text: string): number {
  return bestAlignment(pattern, text).score;
}

/**
 * Where the quoted evidence is in the page text, as [start, end) in that text, or null when it is not there. An exact match
 * after normalisation comes first; otherwise the closest passage, when it is close enough (`threshold`).
 */
export function locateEvidence(
  evidence: string | null,
  pageText: string,
  threshold: number = THRESHOLDS.evidenceSimilarity,
): { start: number; end: number } | null {
  if (!evidence) return null;
  const ev = normalizeForEvidence(evidence);
  if (ev.length < 8) return null;
  const page = normalizeWithMap(pageText);
  const span = (from: number, to: number): { start: number; end: number } | null => {
    while (from < to && page.text[from] === " ") from++;
    while (to > from && page.text[to - 1] === " ") to--;
    return to > from ? { start: page.start[from]!, end: page.end[to - 1]! } : null;
  };
  const at = page.text.indexOf(ev);
  if (at >= 0) return span(at, at + ev.length);

  // Windows twice the quote's length, half a quote apart; the three sharing most trigrams are aligned in full.
  const m = ev.length;
  const step = Math.max(1, Math.floor(m / 2));
  const width = 2 * m;
  const evGrams = trigramSet(ev);
  const scored: [number, number][] = [];
  for (let start = 0; start < page.text.length; start += step) {
    let shared = 0;
    for (const g of trigramSet(page.text.slice(start, start + width))) if (evGrams.has(g)) shared++;
    scored.push([shared, start]);
    if (start + width >= page.text.length) break;
  }
  scored.sort((a, b) => b[0] - a[0]);
  let best: { score: number; start: number; end: number } | null = null;
  for (const [, start] of scored.slice(0, 3)) {
    const { score, end } = bestAlignment(ev, page.text.slice(start, start + width));
    if (score >= threshold && (!best || score > best.score)) best = { score, start: start + Math.max(0, end - m), end: start + end };
  }
  return best ? span(best.start, best.end) : null;
}

/** Whether the quoted evidence is in the page text; the same search that finds it, so the two never disagree. */
export function verifyEvidence(evidence: string | null, pageText: string, threshold: number = THRESHOLDS.evidenceSimilarity): boolean {
  return locateEvidence(evidence, pageText, threshold) !== null;
}
