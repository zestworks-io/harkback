import type { State } from "@harkback/core";
import type { Domain, Tier } from "@harkback/spec";

export interface HistoryEntry {
  encounterId: string;
  date: string;
  sourceTitle: string;
  tier: Tier;
  selection: string;
  explanation: string;
}

export interface HistoryConcept {
  conceptId: string;
  name: string;
  aliases: string[];
  domain: Domain;
  lastAt: number;
  entries: HistoryEntry[];
}

/** A concept's encounters as timeline entries, newest first. */
export function historyEntries(state: State, conceptId: string): HistoryEntry[] {
  return [...(state.encountersByConcept.get(conceptId) ?? [])].reverse().map((id) => {
    const e = state.encounters.get(id)!;
    return {
      encounterId: e.id,
      date: new Date(e.createdAt).toISOString().slice(0, 10),
      sourceTitle: state.sources.get(e.sourceId)?.title || e.sourceId,
      tier: e.explanation.tier,
      selection: e.selection,
      explanation: e.explanation.text,
    };
  });
}

export function historyModel(state: State, query = ""): HistoryConcept[] {
  const q = query.trim().toLowerCase();
  const out: HistoryConcept[] = [];
  for (const c of state.concepts.values()) {
    if (c.isPlaceholder) continue;
    const encounters = (state.encountersByConcept.get(c.id) ?? []).map((id) => state.encounters.get(id)!);
    const all = historyEntries(state, c.id);
    const nameHit = !q || c.names.some((n) => n.toLowerCase().includes(q));
    const entries = nameHit ? all : all.filter((e) => [e.selection, e.explanation, e.sourceTitle].some((s) => s.toLowerCase().includes(q)));
    if (entries.length === 0) continue;
    out.push({
      conceptId: c.id,
      name: c.canonicalName,
      aliases: c.names.filter((n) => n !== c.canonicalName),
      domain: c.domain,
      lastAt: Math.max(...encounters.map((e) => e.createdAt)),
      entries,
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt || a.name.localeCompare(b.name));
}
