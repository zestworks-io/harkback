import { DAY_MS, selectReunions, type Hit, type State } from "@harkback/core";
import type { Tier } from "@harkback/spec";

export interface ReunionCard {
  kind: "direct" | "related";
  /** The concept found on the page. */
  conceptId: string;
  conceptName: string;
  /** For related reunions: the concept the reader understood before. */
  viaName: string | null;
  /** The text on the page that matched, which may be an alias or another spelling of the concept. */
  matched: string;
  start: number;
  end: number;
  encounterId: string;
  daysAgo: number;
  sourceTitle: string;
  section: string;
  /** Playback position in seconds when the term was met in a video; null for any other source. */
  t: number | null;
  tier: Tier;
  preview: string;
}

export function preview(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function reunionCards(
  state: State,
  hits: readonly Hit[],
  o: { sourceId: string; now: number; minGapDays: number; maxPerPage: number },
): ReunionCard[] {
  return selectReunions(state, hits, { sourceId: o.sourceId, now: o.now, minGapDays: o.minGapDays, maxPerPage: o.maxPerPage }).map((r) => {
    const enc = r.encounter;
    return {
      kind: r.kind,
      conceptId: r.conceptId,
      conceptName: state.concepts.get(r.conceptId)?.canonicalName ?? r.hit.text,
      viaName: r.kind === "related" ? (state.concepts.get(r.viaConceptId)?.canonicalName ?? null) : null,
      matched: r.hit.text,
      start: r.hit.start,
      end: r.hit.end,
      encounterId: enc.id,
      daysAgo: Math.max(0, Math.floor((o.now - enc.createdAt) / DAY_MS)),
      sourceTitle: state.sources.get(enc.sourceId)?.title || enc.sourceId,
      section: enc.locator.section ?? "",
      t: enc.locator.t ?? null,
      tier: enc.explanation.tier,
      preview: preview(enc.explanation.text),
    };
  });
}
