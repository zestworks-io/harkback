import { MATCH_RULES } from "./constants";

export type Script = "latin" | "cjk";

export interface NormalizedName {
  norm: string;
  script: Script;
  caseKey: string | null;
}

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/u;
const EDGE_CHARS = String.raw`\s"'` + "`" + String.raw`“”‘’«»()\[\]{}<>.,;:!?、。，；：！？《》「」『』（）【】`;
const EDGE_PUNCT = new RegExp(`^[${EDGE_CHARS}]+|[${EDGE_CHARS}]+$`, "gu");
const LATIN_SEP = /[\s\-‐‑‒–—_/·.]+/u;
const CJK_SEP = /[\s·・‧•\-_]+/gu;

const GREEK: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  ζ: "zeta",
  η: "eta",
  θ: "theta",
  κ: "kappa",
  λ: "lambda",
  μ: "mu",
  ν: "nu",
  ξ: "xi",
  π: "pi",
  ρ: "rho",
  σ: "sigma",
  τ: "tau",
  φ: "phi",
  χ: "chi",
  ψ: "psi",
  ω: "omega",
};

/**
 * Drops the accents of Latin letters, so "résumé" and "resume" are one term. Marks on other scripts stay: kana and Hangul
 * need them. Greek is handled by `transliterateGreek`, which expects the letter without its accent, so it is folded too.
 */
export function foldAccents(s: string): string {
  let out = "";
  let afterLetter = false;
  for (const ch of s.normalize("NFD")) {
    if (/\p{Mn}/u.test(ch)) {
      if (!afterLetter) out += ch;
      continue;
    }
    afterLetter = /[\p{Script=Latin}\p{Script=Greek}]/u.test(ch);
    out += ch;
  }
  return out.normalize("NFC");
}

export function detectScript(s: string): Script {
  return CJK.test(s) ? "cjk" : "latin";
}

function depluralize(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("sses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function transliterateGreek(s: string): string {
  return Array.from(s, (ch) => GREEK[ch] ?? ch).join("");
}

const DETERMINER = /^(?:the|an?|this|that|these|those|our|its|their|such)\s+(?=\S)/i;
const POSSESSIVE = /['’]s$/i;

/** Drops leading articles and a trailing possessive: "the LLM's" and "LLM" are the same term. */
export function stripDeterminers(name: string): string {
  let out = name.normalize("NFKC").replace(EDGE_PUNCT, "");
  for (let prev = ""; prev !== out;) {
    prev = out;
    out = out.replace(DETERMINER, "").replace(POSSESSIVE, "").replace(EDGE_PUNCT, "");
  }
  return out;
}

const ACRONYM_STOP = new Set(["of", "the", "for", "and", "in", "on", "to", "a", "an", "with", "via", "from", "by", "at", "as"]);
const WORD_SEP = /[\s\-‐‑‒–—_/]+/u;

/** "Large Language Model" -> "LLM". Null for single words, CJK names, and words that do not start with a letter. */
export function acronymOf(name: string): string | null {
  const cleaned = stripDeterminers(name);
  if (detectScript(cleaned) === "cjk") return null;
  const words = cleaned.split(WORD_SEP).filter((w) => w && !ACRONYM_STOP.has(w.toLowerCase()));
  if (words.length < 2) return null;
  const letters = words.map((w) => w[0]!);
  return letters.every((l) => /\p{L}/u.test(l)) ? letters.join("").toUpperCase() : null;
}

/** Lower-cased, singular words of a Latin name; empty for CJK names. */
export function wordsOf(name: string): string[] {
  const cleaned = stripDeterminers(name);
  if (detectScript(cleaned) === "cjk") return [];
  return foldAccents(cleaned.toLowerCase()).split(LATIN_SEP).filter(Boolean).map(depluralize);
}

export function normalizeName(input: string): NormalizedName {
  const stripped = stripDeterminers(input);
  const script = detectScript(stripped);
  const cleaned = script === "cjk" ? stripped : foldAccents(stripped);
  if (script === "cjk") {
    return { norm: cleaned.toLowerCase().replace(CJK_SEP, ""), script, caseKey: null };
  }
  const words = transliterateGreek(cleaned.toLowerCase()).split(LATIN_SEP).filter(Boolean);
  const norm = words.map(depluralize).join("");
  let core = transliterateGreek(cleaned.split(LATIN_SEP).join(""));
  const upper = core.match(/[A-Z]/g)?.length ?? 0;
  if (core.length <= MATCH_RULES.shortAcronymMaxLength + 1 && core.endsWith("s") && upper >= 2) core = core.slice(0, -1);
  const caseKey = core.length > 0 && core.length <= MATCH_RULES.shortAcronymMaxLength ? core : null;
  return { norm, script, caseKey };
}

export function identityKey(name: string): string {
  const n = normalizeName(name);
  return n.caseKey ?? n.norm;
}

export function grams(norm: string, script: Script): Set<string> {
  const out = new Set<string>();
  if (script === "cjk") {
    const chars = Array.from(norm);
    if (chars.length < 2) {
      if (chars.length === 1) out.add(norm);
      return out;
    }
    for (let i = 0; i < chars.length - 1; i++) out.add(`${chars[i]}${chars[i + 1]}`);
    return out;
  }
  const padded = `  ${norm} `;
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}
