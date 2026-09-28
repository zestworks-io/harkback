import type { Domain } from "@harkback/spec";
import { THRESHOLDS } from "./constants";
import { grams, jaccard, normalizeName, type Script } from "./normalize";
import type { State } from "./state";

export interface Candidate {
  conceptId: string;
  canonicalName: string;
  domain: Domain;
  score: number;
  isPlaceholder: boolean;
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
    const score = info.norm === q.norm ? 0.95 : jaccard(gramsFor(script), grams(info.norm, script));
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
