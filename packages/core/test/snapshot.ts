import type { State } from "../src/events/state";

function sortedObject<V>(map: Map<string, V>): Record<string, V> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Order-independent plain representation of a State, for comparisons in tests. Warnings are excluded. */
export function snapshotState(state: State): Record<string, unknown> {
  return {
    concepts: sortedObject(
      new Map([...state.concepts].map(([k, c]) => [k, { ...c, names: [...c.names].sort(), members: [...c.members].sort() }] as const)),
    ),
    representative: sortedObject(state.representative),
    aliases: sortedObject(new Map([...state.aliases].map(([k, a]) => [k, { ...a, conceptIds: [...a.conceptIds].sort() }] as const))),
    encounters: sortedObject(state.encounters),
    encountersByConcept: sortedObject(state.encountersByConcept),
    sources: sortedObject(state.sources),
    edges: sortedObject(
      new Map(
        [...state.edges].map(
          ([k, e]) => [k, { ...e, sources: [...e.sources].sort(), evidenceEncounterIds: [...e.evidenceEncounterIds].sort() }] as const,
        ),
      ),
    ),
  };
}
