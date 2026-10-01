import { MATCH_RULES } from "./constants";
import { foldAccents, normalizeName, stripDeterminers, type Script } from "./normalize";
import type { State } from "./state";

/** Kana and Hangul. */
const SYLLABIC = /[぀-ヿ가-힯]/u;
const SEPARATOR = /[\s\-‐‑‒–—_]/;
const SEPARATORS_G = /[\s\-‐‑‒–—_\u00AD]+/g;

export interface PreparedText {
  text: string;
  map: number[];
}

const GREEK_LATIN: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  θ: "theta",
  λ: "lambda",
  μ: "mu",
  π: "pi",
  σ: "sigma",
  τ: "tau",
  φ: "phi",
  ω: "omega",
};

/** Compatibility forms ("ﬁ" -> "fi", full-width letters), accents on Latin letters, Greek letter names, and lower case; may yield several characters. */
function foldChar(ch: string): string {
  const lower = foldAccents(ch.normalize("NFKC").toLowerCase());
  let out = "";
  for (const c of lower) out += GREEK_LATIN[c] ?? c;
  return out.length > 0 ? out : ch;
}

export function prepareText(raw: string): PreparedText {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "\u00AD") continue;
    // An accent written as a separate mark after a Latin letter ("e" + U+0301) is dropped like a precomposed one.
    if (/\p{Mn}/u.test(ch) && /\p{Script=Latin}/u.test(raw[i - 1] ?? "")) continue;
    if (SEPARATOR.test(ch)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += " ";
      map.push(i);
      pendingSpace = false;
    }
    const folded = foldChar(ch);
    text += folded;
    for (let k = 0; k < folded.length; k++) map.push(i);
  }
  return { text, map };
}

export interface MatcherEntry {
  pattern: string;
  key: string;
  script: Script;
  caseKey: string | null;
}

export interface Hit {
  key: string;
  start: number;
  end: number;
  text: string;
}

interface TrieNode {
  next: Map<string, number>;
  fail: number;
  out: number[];
}

interface Entry extends MatcherEntry {
  prepared: string;
}

const isLatinWordChar = (c: string | undefined) => c !== undefined && /[\p{Script=Latin}\p{N}]/u.test(c);

export class Matcher {
  private readonly nodes: TrieNode[] = [{ next: new Map(), fail: 0, out: [] }];
  private readonly entries: Entry[] = [];

  constructor(entries: readonly MatcherEntry[]) {
    for (const e of entries) this.insert(e);
    this.build();
  }

  private insert(e: MatcherEntry): void {
    const prepared = prepareText(e.pattern).text.trim();
    if (!prepared) return;
    if (
      e.script === "cjk" &&
      Array.from(prepared).length < (SYLLABIC.test(prepared) ? MATCH_RULES.syllabicMinMatchLength : MATCH_RULES.cjkMinMatchLength)
    )
      return;
    const index = this.entries.push({ ...e, prepared }) - 1;
    let s = 0;
    for (let i = 0; i < prepared.length; i++) {
      const ch = prepared[i]!;
      let n = this.nodes[s]!.next.get(ch);
      if (n === undefined) {
        n = this.nodes.push({ next: new Map(), fail: 0, out: [] }) - 1;
        this.nodes[s]!.next.set(ch, n);
      }
      s = n;
    }
    this.nodes[s]!.out.push(index);
  }

  private build(): void {
    const queue: number[] = [...this.nodes[0]!.next.values()];
    for (let qi = 0; qi < queue.length; qi++) {
      const r = queue[qi]!;
      for (const [ch, u] of this.nodes[r]!.next) {
        queue.push(u);
        let f = this.nodes[r]!.fail;
        while (f !== 0 && !this.nodes[f]!.next.has(ch)) f = this.nodes[f]!.fail;
        const candidate = this.nodes[f]!.next.get(ch);
        const fail = candidate !== undefined && candidate !== u ? candidate : 0;
        this.nodes[u]!.fail = fail;
        this.nodes[u]!.out.push(...this.nodes[fail]!.out);
      }
    }
  }

  scan(raw: string): Hit[] {
    const { text, map } = prepareText(raw);
    const hits: Hit[] = [];
    let s = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      while (s !== 0 && !this.nodes[s]!.next.has(ch)) s = this.nodes[s]!.fail;
      s = this.nodes[s]!.next.get(ch) ?? 0;
      for (const index of this.nodes[s]!.out) {
        const e = this.entries[index]!;
        const startP = i - e.prepared.length + 1;
        const endP = this.accept(e, text, startP, i, raw, map);
        if (endP < 0) continue;
        const start = map[startP]!;
        const end = map[endP]! + 1;
        hits.push({ key: e.key, start, end, text: raw.slice(start, end) });
      }
    }
    return dropContained(hits);
  }

  /** Returns the accepted end index in prepared text (possibly extended by a plural "s"), or -1. */
  private accept(e: Entry, text: string, startP: number, endP: number, raw: string, map: readonly number[]): number {
    let end = endP;
    if (e.script === "latin") {
      if (isLatinWordChar(text[startP - 1])) return -1;
      if (isLatinWordChar(text[end + 1])) {
        if (text[end + 1] === "s" && !isLatinWordChar(text[end + 2])) end += 1;
        else return -1;
      }
    }
    if (e.caseKey) {
      const original = raw.slice(map[startP]!, map[end]! + 1).replace(SEPARATORS_G, "");
      if (normalizeName(original).caseKey !== e.caseKey) return -1;
    }
    return end;
  }
}

/** Removes hits lying inside a strictly longer hit ("attention" inside "self-attention"); sorts by start. */
function dropContained(hits: Hit[]): Hit[] {
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Hit[] = [];
  let cover: Hit | null = null;
  for (const h of hits) {
    if (cover && h.end <= cover.end && h.end - h.start < cover.end - cover.start) continue;
    out.push(h);
    if (!cover || h.end > cover.end) cover = h;
  }
  return out;
}

export function matcherEntriesFromState(state: State): MatcherEntry[] {
  return [...state.aliases.values()].map((a) => {
    const pattern = stripDeterminers(a.display) || a.display;
    return { pattern, key: a.key, script: a.script, caseKey: normalizeName(pattern).caseKey };
  });
}
