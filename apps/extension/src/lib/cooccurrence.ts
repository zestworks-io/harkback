export interface LastLookup {
  sourceId: string;
  paragraphId: string;
  conceptId: string;
  at: number;
}

export const COOCCURRENCE_WINDOW_MS = 30 * 60_000;

/** Two consecutive lookups in the same paragraph are weakly related; the edge direction is stable (smaller id first). */
export function cooccurrenceEdge(prev: LastLookup | undefined, cur: LastLookup): { from: string; to: string } | null {
  if (!prev || prev.sourceId !== cur.sourceId || prev.paragraphId !== cur.paragraphId) return null;
  if (prev.conceptId === cur.conceptId) return null;
  if (cur.at < prev.at || cur.at - prev.at > COOCCURRENCE_WINDOW_MS) return null;
  return prev.conceptId < cur.conceptId ? { from: prev.conceptId, to: cur.conceptId } : { from: cur.conceptId, to: prev.conceptId };
}
