/**
 * Helpers for text that came from speech recognition (automatic video captions): no capitals, acronyms spelled out letter by
 * letter, and names heard as a word that sounds alike ("Laura" for "LoRA").
 */

/** Frequent short words that a short name must not be read as when case says nothing. */
const COMMON_WORDS = new Set(
  (
    "add age ago aim air all and any app are arm art ask bad bag bar bed big bit box boy bus but buy can cap car cat cut day " +
    "did die dog dry due eat end eye far few fit fly for fun gap get got gun guy had has her him his hit hot how its job key " +
    "kid lab law lay leg let lie log lot low man map max may min mix mod net new not now odd off oil old one our out own pay " +
    "per pin pos put ram raw red ref row run sat sea see set she sit six sky son sum sun tab tag tax tea ten the tie tip top " +
    "try two use war was way web wet who why win yes yet you"
  ).split(" "),
);

/** True when a line has letters but no capitals, so case cannot tell an acronym from a word. */
export function hasNoCase(line: string): boolean {
  return /\p{L}/u.test(line) && !/\p{Lu}/u.test(line);
}

/** Whether a short name may be matched without its case: long enough, and not a frequent word. */
export function caselessOk(name: string): boolean {
  const n = name.toLowerCase();
  return n.length >= 3 && !COMMON_WORDS.has(n);
}

/** American Soundex of a word of Latin letters: the first letter and three digits for the consonant sounds that follow. */
export function soundex(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  const code = (c: string): string =>
    "bfpv".includes(c)
      ? "1"
      : "cgjkqsxz".includes(c)
        ? "2"
        : "dt".includes(c)
          ? "3"
          : c === "l"
            ? "4"
            : "mn".includes(c)
              ? "5"
              : c === "r"
                ? "6"
                : "";
  let out = w[0]!.toUpperCase();
  let last = code(w[0]!);
  for (const c of w.slice(1)) {
    const d = code(c);
    if (d && d !== last) out += d;
    // H and W do not separate two equal codes; vowels do.
    if (c !== "h" && c !== "w") last = d;
    if (out.length === 4) break;
  }
  return out.padEnd(4, "0");
}

/** Edit distance with transpositions, or `max + 1` as soon as it is certain to exceed `max`. */
export function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2]! + 1);
      cur.push(d);
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** How many edits a name heard in speech may differ by: none below six letters, one up to eleven, two from twelve. */
export function allowedEdits(letters: number): number {
  return letters >= 12 ? 2 : letters >= 6 ? 1 : 0;
}

/** Letters joined by dots ("g.p.t."). */
const DOTTED = /(?<![\p{L}\p{N}])\p{L}(?:\.\p{L}){1,}\.?(?![\p{L}\p{N}])/gu;
/** Three or more letters standing alone ("r l h f"); two could be a word and a letter ("plan a b"). */
const SPACED = /(?<![\p{L}\p{N}])\p{L}(?: \p{L}(?![\p{L}\p{N}])){2,}/gu;

/**
 * Joins letters spelled out one by one ("r l h f", "g.p.t.") into one word, in text already prepared for matching. A leading
 * "a" or "i" is the word it is ("a g p t"). Returns the new text and, for each of its characters, the index in the text given.
 */
export function joinSpelledLetters(text: string): { text: string; map: number[] } {
  const drop = new Set<number>();
  for (const m of text.matchAll(DOTTED)) for (let i = m.index; i < m.index + m[0].length; i++) if (text[i] === ".") drop.add(i);
  for (const m of text.matchAll(SPACED)) {
    let from = m.index;
    if ((text[from] === "a" || text[from] === "i") && m[0].length >= 7) from += 2;
    else if (text[from] === "a" || text[from] === "i") continue;
    for (let i = from; i < m.index + m[0].length; i++) if (text[i] === " ") drop.add(i);
  }
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (drop.has(i)) continue;
    out += text[i];
    map.push(i);
  }
  return { text: out, map };
}
