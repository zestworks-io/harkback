import { MATCH_RULES } from "../constants";
import { foldArabic, foldHan, isArabicMark } from "./fold";
import { inflectedForms } from "./inflect";
import { foldAccents, normalizeName, stripDeterminers, type Script } from "./normalize";
import type { State } from "../events/state";
import { allowedEdits, boundedDistance, caselessOk, hasNoCase, joinSpelledLetters, soundex } from "./speech";

/** Kana and Hangul. */
const SYLLABIC = /[぀-ヿ가-힯]/u;
/** A name of two characters that are both Han. */
const TWO_HAN = /^[㐀-䶿一-鿿豈-﫿]{2}$/u;
const CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/u;
const KANA = /[぀-ヿ]/u;
const ARABIC_CHAR = /\p{Script=Arabic}/u;
/** What may stand in front of an Arabic name without being another word: and, with, to, like, the, or two of them. */
const ARABIC_PREFIX = /^[وف]?(?:[بكل]?ال|لل|[بكل])?$/u;
/** Plural, dual, pronoun and case endings. */
const ARABIC_SUFFIX = /^(?:ات|ان|ين|ون|ها|هم|نا|ي|ك|ه|ا)$/u;
/** How many characters of a Han run on each side of a name are looked at to find where its words end. */
const SEGMENT_WINDOW = 40;
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

/**
 * Compatibility forms ("ﬁ" -> "fi", full-width letters), accents on Latin letters, Greek letter names, lower case, and the
 * spellings of Arabic and Han that are one word; may yield several characters.
 */
function foldChar(ch: string): string {
  const lower = foldAccents(ch.normalize("NFKC").toLowerCase());
  let out = "";
  for (const c of lower) out += GREEK_LATIN[c] ?? c;
  const code = out.codePointAt(0)!;
  if (code >= 0x0600 && code <= 0x06ff) out = foldArabic(out);
  else if (code >= 0x4e00 && code <= 0x9fff) out = foldHan(out);
  return out.length > 0 ? out : ch;
}

export function prepareText(raw: string): PreparedText {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  // Whole code points, so that characters outside the BMP (mathematical bold letters, rare CJK) fold like any other.
  for (let i = 0, width = 1; i < raw.length; i += width) {
    const ch = String.fromCodePoint(raw.codePointAt(i)!);
    width = ch.length;
    if (ch === "\u00AD" || isArabicMark(ch)) continue;
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

let segmenters: { zh: Intl.Segmenter; ja: Intl.Segmenter } | null | undefined;

function segmenter(locale: "zh" | "ja"): Intl.Segmenter | null {
  if (segmenters === undefined) {
    try {
      segmenters = { zh: new Intl.Segmenter("zh", { granularity: "word" }), ja: new Intl.Segmenter("ja", { granularity: "word" }) };
    } catch {
      segmenters = null;
    }
  }
  return segmenters?.[locale] ?? null;
}

/**
 * Whether raw[start, end) is made of whole words. Han has no spaces, so the words come from the browser's dictionary, looking
 * at the run of Han, kana and Hangul around the name. Without a dictionary nothing counts as a whole word.
 */
function onWordBoundaries(raw: string, start: number, end: number): boolean {
  let from = start;
  while (from > 0 && start - from < SEGMENT_WINDOW && CJK_CHAR.test(raw[from - 1]!)) from--;
  let to = end;
  while (to < raw.length && to - end < SEGMENT_WINDOW && CJK_CHAR.test(raw[to]!)) to++;
  const run = raw.slice(from, to);
  const seg = segmenter(KANA.test(run) ? "ja" : "zh");
  if (!seg) return false;
  const edges = new Set<number>();
  for (const part of seg.segment(run)) {
    edges.add(part.index);
    edges.add(part.index + part.segment.length);
  }
  return edges.has(start - from) && edges.has(end - from);
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
  /** A two-character Han name, which is underlined only where the page's words begin and end around it. */
  wholeWord?: boolean;
}

/** The index just past the character that starts at `index`. */
const after = (raw: string, index: number): number => index + (raw.codePointAt(index)! > 0xffff ? 2 : 1);

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
    ) {
      if (TWO_HAN.test(prepared)) this.add({ ...e, prepared, wholeWord: true });
      return;
    }
    this.add({ ...e, prepared });
    // "to the network" drops the alef of the article: "للشبكة" for "ل" + "الشبكة".
    if (e.script === "arabic" && prepared.startsWith("ال") && prepared.length > 4) this.add({ ...e, prepared: `ل${prepared.slice(2)}` });
    // Another form of a long name (a German plural, a Portuguese "-ões") underlines as the name does. Short names that are
    // matched by case have none.
    if (e.script === "latin" && !e.caseKey) for (const form of inflectedForms(prepared)) this.add({ ...e, prepared: form });
  }

  private add(e: Entry): void {
    const index = this.entries.push(e) - 1;
    let s = 0;
    for (let i = 0; i < e.prepared.length; i++) {
      const ch = e.prepared[i]!;
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

  /**
   * Finds the names in `raw`. With `speech` (automatic captions), letters spelled out one by one are read as one word, case is
   * ignored on a line that has none, and a name heard slightly wrong is matched too (see `heard`).
   */
  scan(raw: string, opts: { speech?: boolean } = {}): Hit[] {
    const prepared = prepareText(raw);
    if (!opts.speech) return dropContained(this.exact(raw, prepared.text, prepared.map, false));
    const joined = joinSpelledLetters(prepared.text);
    const map = joined.map.map((i) => prepared.map[i]!);
    const caseless = hasNoCase(raw);
    const exact = this.exact(raw, joined.text, map, caseless);
    return dropContained([...exact, ...this.heard(raw, joined.text, map, caseless, exact)]);
  }

  private exact(raw: string, text: string, map: readonly number[], caseless: boolean): Hit[] {
    const hits: Hit[] = [];
    let s = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      while (s !== 0 && !this.nodes[s]!.next.has(ch)) s = this.nodes[s]!.fail;
      s = this.nodes[s]!.next.get(ch) ?? 0;
      for (const index of this.nodes[s]!.out) {
        const e = this.entries[index]!;
        const startP = i - e.prepared.length + 1;
        const endP = this.accept(e, text, startP, i, raw, map, caseless);
        if (endP < 0) continue;
        const start = map[startP]!;
        let end = after(raw, map[endP]!);
        if (e.script === "arabic") while (end < raw.length && isArabicMark(raw[end]!)) end++;
        hits.push({ key: e.key, start, end, text: raw.slice(start, end) });
      }
    }
    return hits;
  }

  /**
   * Latin names heard slightly wrong, word by word: within a few edits for a long name, or sounding the same (Soundex) and at
   * most two edits away for a short name matched by case, on a line without case. Words already matched exactly are skipped.
   */
  private heard(raw: string, text: string, map: readonly number[], caseless: boolean, exact: readonly Hit[]): Hit[] {
    const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }));
    const taken = (start: number, end: number) => exact.some((h) => h.start < end && start < h.end);
    const hits: Hit[] = [];
    const seen = new Set<string>();
    for (const e of this.entries) {
      // The first entry of a name is the name as written; its other forms add nothing a few edits do not.
      if (e.script !== "latin" || seen.has(e.key)) continue;
      seen.add(e.key);
      const compact = e.prepared.replace(/ /g, "");
      const count = e.prepared.split(" ").length;
      const edits = allowedEdits(compact.length);
      const soundsLike = caseless && e.caseKey !== null && count === 1 && compact.length >= 4 && caselessOk(e.caseKey);
      if (edits === 0 && !soundsLike) continue;
      const code = soundsLike ? soundex(compact) : "";
      // The same number of words, or one more or fewer: speech splits and joins words ("fine tune", "finetune").
      for (const n of [count - 1, count, count + 1]) {
        if (n < 1) continue;
        for (let w = 0; w + n <= words.length; w++) {
          const heardAs = words
            .slice(w, w + n)
            .map((x) => x.word)
            .join("");
          let ok = edits > 0 && boundedDistance(heardAs, compact, edits) <= edits;
          if (!ok && soundsLike && n === 1 && heardAs[0] === compact[0] && soundex(heardAs) === code)
            ok = boundedDistance(heardAs, compact, 2) <= 2;
          if (!ok) continue;
          const start = map[words[w]!.start]!;
          const end = after(raw, map[words[w + n - 1]!.end - 1]!);
          if (!taken(start, end)) hits.push({ key: e.key, start, end, text: raw.slice(start, end) });
        }
      }
    }
    return hits;
  }

  /** Returns the accepted end index in prepared text (possibly extended by a plural "s"), or -1. */
  private accept(e: Entry, text: string, startP: number, endP: number, raw: string, map: readonly number[], caseless: boolean): number {
    let end = endP;
    if (e.script === "latin") {
      if (isLatinWordChar(text[startP - 1])) return -1;
      if (isLatinWordChar(text[end + 1])) {
        if (text[end + 1] === "s" && !isLatinWordChar(text[end + 2])) end += 1;
        else return -1;
      }
    }
    if (e.script === "arabic") {
      if (!arabicEdge(text, startP - 1, -1, ARABIC_PREFIX, 5) || !arabicEdge(text, end + 1, 1, ARABIC_SUFFIX, 3)) return -1;
    }
    if (e.wholeWord && !onWordBoundaries(raw, map[startP]!, after(raw, map[end]!))) return -1;
    if (e.caseKey) {
      const original = raw.slice(map[startP]!, after(raw, map[end]!)).replace(SEPARATORS_G, "");
      // A line without case says nothing about case, so a name matched by case is taken as written unless it is a common word.
      const ignored = caseless && caselessOk(e.caseKey) && original.toLowerCase().replace(/\./g, "") === e.caseKey.toLowerCase();
      if (!ignored && normalizeName(original).caseKey !== e.caseKey) return -1;
    }
    return end;
  }
}

/**
 * Whether the Arabic letters next to a name, read from `index` in direction `step`, are nothing or one of the affixes `allowed`
 * lists. At most `max` letters are looked at; a longer run is another word whatever it holds.
 */
function arabicEdge(text: string, index: number, step: 1 | -1, allowed: RegExp, max: number): boolean {
  let letters = "";
  for (let i = index; i >= 0 && i < text.length && ARABIC_CHAR.test(text[i]!) && letters.length < max; i += step) {
    letters = step === 1 ? letters + text[i]! : text[i]! + letters;
  }
  return letters === "" || allowed.test(letters);
}

/** Removes hits lying inside a strictly longer hit ("attention" inside "self-attention"); sorts by start. */
function dropContained(hits: Hit[]): Hit[] {
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Hit[] = [];
  const seen = new Set<string>();
  let cover: Hit | null = null;
  for (const h of hits) {
    const id = `${h.start}:${h.end}:${h.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
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
