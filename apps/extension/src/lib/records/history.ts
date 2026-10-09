import { isSensitiveSource, type State } from "@harkback/core";
import type { Domain, Tier } from "@harkback/spec";
import { videoIdFromSourceId, watchUrlAt } from "../video/youtube";

/** One follow-up question asked on the card and the answer it got. */
export interface FollowUp {
  at: number;
  question: string;
  answer: string;
}

/**
 * Where a source can be opened again: its recorded address, or the arXiv or DOI page; never a local file or a non-web address.
 * A video met at playback position `t` opens at that moment.
 */
export function sourceUrl(state: State, sourceId: string, t?: number): string | null {
  const video = t === undefined ? null : videoIdFromSourceId(sourceId);
  if (video) return watchUrlAt(video, t!);
  const ids = state.sources.get(sourceId)?.ids;
  const candidates = [
    ids?.url,
    ids?.arxiv ? `https://arxiv.org/abs/${ids.arxiv}` : undefined,
    ids?.doi ? `https://doi.org/${ids.doi}` : undefined,
  ];
  return candidates.find((u) => u !== undefined && /^https?:\/\//i.test(u)) ?? null;
}

export interface HistoryEntry {
  encounterId: string;
  date: string;
  sourceId: string;
  sourceTitle: string;
  /** Where to open the source again, when it has a web address; for a video, at the moment it was met. */
  sourceUrl: string | null;
  /** Playback position in seconds when the term was met in a video; null for any other source. */
  t: number | null;
  /** The source is marked sensitive: its content stays on this computer. */
  sensitive: boolean;
  tier: Tier;
  selection: string;
  explanation: string;
  /** The conversation after the explanation, oldest first. */
  followUps: FollowUp[];
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
      sourceId: e.sourceId,
      sourceTitle: state.sources.get(e.sourceId)?.title || e.sourceId,
      sourceUrl: sourceUrl(state, e.sourceId, e.locator.t),
      t: e.locator.t ?? null,
      sensitive: isSensitiveSource(state, e.sourceId),
      tier: e.explanation.tier,
      selection: e.selection,
      explanation: e.explanation.text,
      followUps: e.actions.flatMap((a) =>
        a.action === "followed_up" && a.detail?.question ? [{ at: a.at, question: a.detail.question, answer: a.detail.answer ?? "" }] : [],
      ),
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
    const entries = nameHit
      ? all
      : all.filter((e) =>
          [e.selection, e.explanation, e.sourceTitle, ...e.followUps.flatMap((f) => [f.question, f.answer])].some((s) =>
            s.toLowerCase().includes(q),
          ),
        );
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
