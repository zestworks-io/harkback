import { THRESHOLDS, type State } from "@harkback/core";

type Edge = State["edges"] extends ReadonlyMap<string, infer E> ? E : never;

/** A relation the reader has not rejected, and that is either confirmed or likely enough to show. */
export function isActiveEdge(edge: Edge): boolean {
  if (edge.status === "rejected") return false;
  return edge.status === "confirmed" || edge.confidence >= THRESHOLDS.relatedEdgeConfidence;
}

/** For each concept, the concepts it needs understood first (after merges). Concepts with none are absent. */
export function prerequisiteMap(state: State): Map<string, Set<string>> {
  const rep = (id: string): string => state.representative.get(id) ?? id;
  const out = new Map<string, Set<string>>();
  for (const edge of state.edges.values()) {
    if (edge.rel !== "prerequisite" || !isActiveEdge(edge)) continue;
    const from = rep(edge.from);
    const to = rep(edge.to);
    if (from === to) continue;
    let set = out.get(from);
    if (!set) out.set(from, (set = new Set()));
    set.add(to);
  }
  return out;
}

/**
 * Puts each item after the items it builds on, keeping the given order otherwise. A prerequisite counts even when it is
 * reached through concepts that are not in the list. Items in a cycle, which no order can satisfy, keep their given order.
 * Also returns, for each item, the later items that build on it.
 */
export function orderByPrerequisites<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  prerequisites: ReadonlyMap<string, ReadonlySet<string>>,
): { ordered: T[]; dependents: Map<string, string[]> } {
  const ids = new Set(items.map(idOf));
  const blockers = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const item of items) {
    const id = idOf(item);
    const found = new Set<string>();
    const seen = new Set<string>([id]);
    const stack = [...(prerequisites.get(id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      if (ids.has(next)) found.add(next);
      stack.push(...(prerequisites.get(next) ?? []));
    }
    blockers.set(id, [...found]);
    for (const b of found) dependents.set(b, [...(dependents.get(b) ?? []), id]);
  }

  const remaining = [...items];
  const waiting = new Set(ids);
  const ordered: T[] = [];
  while (remaining.length > 0) {
    let at = remaining.findIndex((item) => !blockers.get(idOf(item))!.some((b) => waiting.has(b)));
    if (at < 0) at = 0; // a cycle: nothing can go first, so the given order decides
    const [item] = remaining.splice(at, 1);
    waiting.delete(idOf(item!));
    ordered.push(item!);
  }
  return { ordered, dependents };
}
