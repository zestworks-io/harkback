import { THRESHOLDS } from "./constants";

function normalizeForEvidence(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/­/g, "")
    .toLowerCase()
    .replace(/[\-‐‑‒–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigramSet(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Sellers' algorithm: best alignment of `pattern` against any substring of `text`. */
export function approxSubstringSimilarity(pattern: string, text: string): number {
  const m = pattern.length;
  if (m === 0) return 0;
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  let best = prev[m]!;
  for (let j = 1; j <= text.length; j++) {
    cur[0] = 0;
    const tc = text[j - 1];
    for (let i = 1; i <= m; i++) {
      const cost = pattern[i - 1] === tc ? 0 : 1;
      cur[i] = Math.min(prev[i]! + 1, cur[i - 1]! + 1, prev[i - 1]! + cost);
    }
    best = Math.min(best, cur[m]!);
    [prev, cur] = [cur, prev];
  }
  return 1 - best / m;
}

export function verifyEvidence(
  evidence: string | null,
  pageText: string,
  threshold: number = THRESHOLDS.evidenceSimilarity,
): boolean {
  if (!evidence) return false;
  const ev = normalizeForEvidence(evidence);
  if (ev.length < 8) return false;
  const page = normalizeForEvidence(pageText);
  if (page.includes(ev)) return true;

  const m = ev.length;
  const step = Math.max(1, Math.floor(m / 2));
  const span = 2 * m;
  const evGrams = trigramSet(ev);
  const scored: [number, number][] = [];
  for (let start = 0; start < page.length; start += step) {
    const windowGrams = trigramSet(page.slice(start, start + span));
    let shared = 0;
    for (const g of windowGrams) if (evGrams.has(g)) shared++;
    scored.push([shared, start]);
    if (start + span >= page.length) break;
  }
  scored.sort((a, b) => b[0] - a[0]);
  for (const [, start] of scored.slice(0, 3)) {
    if (approxSubstringSimilarity(ev, page.slice(start, start + span)) >= threshold) return true;
  }
  return false;
}
