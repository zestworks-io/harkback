import type { Domain } from "@harkback/spec";
import { THRESHOLDS } from "./constants";
import { acronymOf, grams, jaccard, normalizeName, wordsOf, type Script } from "./normalize";
import type { State } from "./state";

export interface Candidate {
  conceptId: string;
  canonicalName: string;
  domain: Domain;
  score: number;
  isPlaceholder: boolean;
}

/** Score for a name that contains the other as whole words ("llm agent" / "LLM"): shown to the model, never asked about. */
const CONTAINMENT_SCORE = 0.5;
const ACRONYM_SCORE = 0.9;

function containsWords(long: readonly string[], short: readonly string[]): boolean {
  if (short.length === 0 || short.length >= long.length || short.join("").length < 3) return false;
  for (let i = 0; i + short.length <= long.length; i++) if (short.every((w, j) => long[i + j] === w)) return true;
  return false;
}

export function findCandidates(state: State, query: string, k = 3, minScore: number = THRESHOLDS.candidateMinSimilarity): Candidate[] {
  const q = normalizeName(query);
  const qKey = q.caseKey ?? q.norm;
  if (!qKey) return [];

  const best = new Map<string, number>();
  const bump = (conceptId: string, score: number) => {
    if (score > (best.get(conceptId) ?? 0)) best.set(conceptId, score);
  };

  state.aliases.get(qKey)?.conceptIds.forEach((conceptId) => bump(conceptId, 1));

  // "large language model" finds a concept known only as "LLM".
  const acronym = acronymOf(query);
  const acronymNorm = acronym ? normalizeName(acronym).norm : null;
  const qWords = wordsOf(query);

  const queryGrams = new Map<Script, Set<string>>();
  const gramsFor = (script: Script) => {
    let g = queryGrams.get(script);
    if (!g) {
      g = grams(q.norm, script);
      queryGrams.set(script, g);
    }
    return g;
  };

  for (const info of state.aliases.values()) {
    if (info.key === qKey) continue;
    const script: Script = info.script === "cjk" || q.script === "cjk" ? "cjk" : "latin";
    let score = info.norm === q.norm ? 0.95 : jaccard(gramsFor(script), grams(info.norm, script));
    if (acronymNorm !== null && info.norm === acronymNorm) score = Math.max(score, ACRONYM_SCORE);
    if (score < ACRONYM_SCORE && q.script === "latin" && info.script === "latin") {
      const aWords = wordsOf(info.display);
      if (containsWords(qWords, aWords) || containsWords(aWords, qWords)) score = Math.max(score, CONTAINMENT_SCORE);
    }
    for (const conceptId of info.conceptIds) bump(conceptId, score);
  }

  return [...best]
    .filter(([, score]) => score >= minScore)
    .sort(([a, sa], [b, sb]) => sb - sa || (a < b ? -1 : 1))
    .slice(0, k)
    .map(([conceptId, score]) => {
      const c = state.concepts.get(conceptId)!;
      return { conceptId, canonicalName: c.canonicalName, domain: c.domain, score, isPlaceholder: c.isPlaceholder };
    });
}
