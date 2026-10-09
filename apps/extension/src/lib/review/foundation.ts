import type { State } from "@harkback/core";
import { understandingOf } from "../records/concept-detail";
import { prerequisiteMap } from "./prerequisites";

export type GapReason = "confused" | "shaky" | "unstudied";

export interface FoundationGap {
  conceptId: string;
  name: string;
  /** Other names, so the link can be shown in the reader's language. */
  aliases: string[];
  reason: GapReason;
}

/**
 * What to learn first for a concept the reader is struggling with: the prerequisites that are themselves confused, shaky or
 * never looked up, followed down through weak ones to the weakest foundations (a prerequisite the reader grasps ends the search). Empty when the
 * concept is muted or not struggling (understood or new), when it has no prerequisites, or when all of them are in good shape.
 */
export function foundationGaps(state: State, conceptId: string): FoundationGap[] {
  const id = state.representative.get(conceptId) ?? conceptId;
  if (state.concepts.get(id)?.muted) return [];
  const own = understandingOf(state, id);
  if (own !== "confused" && own !== "shaky") return [];
  const prerequisites = prerequisiteMap(state);

  const reasonOf = (cid: string): GapReason | null => {
    const concept = state.concepts.get(cid);
    if (!concept || concept.muted) return null;
    if (concept.isPlaceholder) return "unstudied";
    const u = understandingOf(state, cid);
    return u === "confused" || u === "shaky" ? u : null;
  };

  // The weakest foundations under a concept, by way of weak prerequisites only: a prerequisite you grasp ends the search there.
  const memo = new Map<string, Set<string>>();
  const onPath = new Set<string>([id]);
  const rootsUnder = (cid: string): Set<string> => {
    const known = memo.get(cid);
    if (known) return known;
    const roots = new Set<string>();
    onPath.add(cid);
    for (const p of prerequisites.get(cid) ?? []) {
      if (onPath.has(p) || !reasonOf(p)) continue;
      const below = rootsUnder(p);
      if (below.size === 0) roots.add(p);
      else for (const r of below) roots.add(r);
    }
    onPath.delete(cid);
    memo.set(cid, roots);
    return roots;
  };
  const found = new Map<string, GapReason>();
  for (const cid of rootsUnder(id)) found.set(cid, reasonOf(cid)!);

  return [...found]
    .map(([cid, reason]) => {
      const c = state.concepts.get(cid)!;
      return { conceptId: cid, name: c.canonicalName, aliases: c.names.filter((n) => n !== c.canonicalName), reason };
    })
    .sort((a, b) => Number(a.reason === "unstudied") - Number(b.reason === "unstudied") || a.name.localeCompare(b.name, "en"));
}
