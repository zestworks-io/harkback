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
const LATIN_SEP = /[\s\-‐‑‒–—_\/·.]+/u;
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

export function normalizeName(input: string): NormalizedName {
  const cleaned = input.normalize("NFKC").replace(EDGE_PUNCT, "");
  const script = detectScript(cleaned);
  if (script === "cjk") {
    return { norm: cleaned.toLowerCase().replace(CJK_SEP, ""), script, caseKey: null };
  }
  const words = transliterateGreek(cleaned.toLowerCase()).split(LATIN_SEP).filter(Boolean);
  const norm = words.map(depluralize).join("");
  let core = cleaned.split(LATIN_SEP).join("");
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
