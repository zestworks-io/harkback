import type { Domain } from "@harkback/spec";
import { DAY_MS, REUNION_DEFAULTS, THRESHOLDS } from "../constants";
import type { Hit } from "./matcher";
import { sameSource, type EncounterState, type State } from "../events/state";

export interface ReunionContext {
  sourceId: string;
  now: number;
  minGapDays?: number;
  maxPerPage?: number;
}

export type Reunion =
  | { kind: "direct"; conceptId: string; hit: Hit; encounter: EncounterState }
  | { kind: "related"; conceptId: string; viaConceptId: string; hit: Hit; encounter: EncounterState };

export function selectReunions(state: State, hits: readonly Hit[], ctx: ReunionContext): Reunion[] {
  const minGap = (ctx.minGapDays ?? REUNION_DEFAULTS.minGapDays) * DAY_MS;
  const maxPerPage = ctx.maxPerPage ?? REUNION_DEFAULTS.maxPerPage;

  const firstHit = new Map<string, Hit>();
  for (const h of [...hits].sort((a, b) => a.start - b.start)) if (!firstHit.has(h.key)) firstHit.set(h.key, h);

  const corroborating = new Map<Domain, Set<string>>();
  for (const key of firstHit.keys()) {
    const info = state.aliases.get(key);
    if (!info || info.ambiguous) continue;
    for (const conceptId of info.conceptIds) {
      const domain = state.concepts.get(conceptId)?.domain;
      if (!domain) continue;
      const set = corroborating.get(domain);
      if (set) set.add(key);
      else corroborating.set(domain, new Set([key]));
    }
  }

  const conceptHits = new Map<string, Hit>();
  for (const [key, hit] of firstHit) {
    const info = state.aliases.get(key);
    if (!info) continue;
    for (const conceptId of info.conceptIds) {
      const c = state.concepts.get(conceptId);
      if (!c) continue;
      if (info.ambiguous) {
        const others = [...(corroborating.get(c.domain) ?? [])].filter((k) => k !== key);
        if (others.length === 0) continue;
      }
      const prev = conceptHits.get(conceptId);
      if (!prev || hit.start < prev.start) conceptHits.set(conceptId, hit);
    }
  }

  const encountersOf = (conceptId: string) => (state.encountersByConcept.get(conceptId) ?? []).map((eid) => state.encounters.get(eid)!);
  const lastTouched = (conceptId: string) => Math.max(...encountersOf(conceptId).map((e) => e.lastTouchedAt));

  // The reader said the term means something else on this page.
  const dismissedHere = (conceptId: string): boolean =>
    (state.dismissed.get(conceptId) ?? []).some((s) => sameSource(state, s, ctx.sourceId));

  const eligible = (conceptId: string): EncounterState | null => {
    const c = state.concepts.get(conceptId);
    if (!c || c.muted || c.isPlaceholder || dismissedHere(conceptId)) return null;
    if (ctx.now - lastTouched(conceptId) < minGap) return null;
    const fromOther = encountersOf(conceptId).filter((e) => !sameSource(state, e.sourceId, ctx.sourceId));
    if (fromOther.length === 0) return null;
    return fromOther.reduce((a, b) => (b.lastTouchedAt > a.lastTouchedAt ? b : a));
  };

  const picked = new Map<string, Reunion>();
  for (const [conceptId, hit] of conceptHits) {
    const enc = eligible(conceptId);
    if (enc) picked.set(conceptId, { kind: "direct", conceptId, hit, encounter: enc });
  }

  for (const [conceptId, hit] of conceptHits) {
    const c = state.concepts.get(conceptId)!;
    if (c.muted || !c.isPlaceholder || dismissedHere(conceptId)) continue;
    for (const edge of state.edges.values()) {
      if (edge.from !== conceptId || edge.rel !== "variant_of" || edge.status === "rejected") continue;
      if (edge.status !== "confirmed" && edge.confidence < THRESHOLDS.relatedEdgeConfidence) continue;
      if (picked.has(edge.to)) continue;
      const enc = eligible(edge.to);
      if (enc) {
        picked.set(edge.to, { kind: "related", conceptId, viaConceptId: edge.to, hit, encounter: enc });
        break;
      }
    }
  }

  const shown = (r: Reunion) => (r.kind === "direct" ? r.conceptId : r.viaConceptId);
  const confused = (conceptId: string) => encountersOf(conceptId).some((e) => e.everConfused);

  return [...picked.values()]
    .sort((a, b) => {
      const ca = confused(shown(a)) ? 0 : 1;
      const cb = confused(shown(b)) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      const ta = lastTouched(shown(a));
      const tb = lastTouched(shown(b));
      if (ta !== tb) return ta - tb;
      return a.hit.start - b.hit.start;
    })
    .slice(0, maxPerPage);
}
