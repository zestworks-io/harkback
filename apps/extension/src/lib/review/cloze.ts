import { detectScript, Matcher, normalizeName } from "@harkback/core";

const BLANK = "[…]";
const MAX_SENTENCES = 2;
const MAX_LENGTH = 400;

/** Marks that only format text: bold, code, headings, quotes and list bullets at the start of a line. A single `*` or `#` can be part of a name. */
const FORMATTING = /\*\*|__|`|^\s*(?:#{1,6}|>|[-+*])\s+/gm;
/** After a full stop that ends a sentence (not the one in "Node.js"), a Chinese or Japanese full stop, and a line break. */
const SENTENCE_END = /(?<=[。！？])|(?<=[.!?])\s+|\n+/u;

/**
 * Sentences of an explanation that mention the term, with the term hidden: a prompt to recall it from. Matches the term under
 * any of its names and in the inflected forms the matcher knows. Null when no sentence mentions it, so the card shows no hint.
 */
export function clozeHint(explanation: string, names: readonly string[]): string | null {
  const matcher = new Matcher(
    names.map((pattern) => ({ pattern, key: "term", script: detectScript(pattern), caseKey: normalizeName(pattern).caseKey })),
  );
  const sentences = explanation
    .replace(FORMATTING, "")
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const sentence of sentences) {
    const hits = matcher.scan(sentence);
    if (hits.length === 0) continue;
    let text = sentence;
    for (const hit of [...hits].reverse()) text = text.slice(0, hit.start) + BLANK + text.slice(hit.end);
    out.push(text);
    if (out.length === MAX_SENTENCES) break;
  }
  if (out.length === 0) return null;
  const joined = out.join(" ");
  return joined.length > MAX_LENGTH ? `${joined.slice(0, MAX_LENGTH).trimEnd()}…` : joined;
}
