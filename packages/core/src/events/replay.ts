import type { EventOf, HarkEvent } from "@harkback/spec";
import { DEFAULT_AMBIGUOUS_ACRONYMS } from "../constants";
import { edgeId, parseEdgeId } from "./ids";
import { gradeOf } from "../review/grade";
import { canonicalOrder } from "./order";
import { resolveConcepts } from "./replay-concepts";
import { resolveSourceIdentity } from "./source-identity";
import type { EdgeState, EncounterState, SourceState, State } from "./state";

export interface ReplayOptions {
  ambiguousAcronyms?: ReadonlySet<string>;
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function replay(events: readonly HarkEvent[], options: ReplayOptions = {}): State {
  const sorted = canonicalOrder(events);
  // Encounter id -> the concept the reader moved it to, the last move winning.
  const moved = new Map<string, string>();
  const movedAt = new Map<string, number>();
  for (const [position, e] of sorted.entries())
    if (e.type === "encounter.moved") {
      moved.set(e.payload.encounter_id, e.payload.concept_id);
      movedAt.set(e.payload.encounter_id, position);
    }
  const { concepts, representative, aliases, warnings } = resolveConcepts(
    sorted,
    options.ambiguousAcronyms ?? DEFAULT_AMBIGUOUS_ACRONYMS,
    moved,
  );

  const sources = new Map<string, SourceState>();
  const created = new Map<string, EventOf<"encounter.created">>();
  const deleted = new Set<string>();
  const actions: EventOf<"encounter.action">[] = [];
  const later: EventOf<"encounter.noted" | "encounter.explained">[] = [];
  const mutes: (EventOf<"concept.muted"> | EventOf<"concept.unmuted">)[] = [];
  const dismissals: EventOf<"reunion.dismissed">[] = [];
  const consents: State["consents"] = [];
  const proposals: EventOf<"edge.proposed">[] = [];
  const statuses: [EventOf<"edge.confirmed"> | EventOf<"edge.rejected">, number][] = [];

  let seenCount = 0;
  for (const [position, e] of sorted.entries()) {
    switch (e.type) {
      case "source.seen": {
        const p = e.payload;
        const prev = sources.get(p.source_id);
        seenCount++;
        const keptSensitive = prev?.sensitivity === "sensitive" && p.sensitivity === "normal" && !p.by_user;
        sources.set(p.source_id, {
          id: p.source_id,
          ids: { ...prev?.ids, ...definedOnly(p.ids) },
          title: p.title || prev?.title || "",
          // A record that could not see the licence (the PDF of a paper) does not forget one seen before.
          license: p.license === "unknown" && prev ? prev.license : p.license,
          // Sensitive is sticky: only the reader's own choice makes a source normal again, so a later, automatic record
          // (another device that never knew the source was sensitive) cannot expose it.
          sensitivity: keptSensitive ? "sensitive" : p.sensitivity,
          ...(p.by_user || prev?.chosen ? { chosen: true as const } : {}),
          ...(p.by_user ? { decidedAt: seenCount } : prev?.decidedAt !== undefined ? { decidedAt: prev.decidedAt } : {}),
          ...(p.sensitivity === "sensitive"
            ? { sensitiveAt: seenCount }
            : keptSensitive && prev.sensitiveAt !== undefined
              ? { sensitiveAt: prev.sensitiveAt }
              : {}),
        });
        break;
      }
      case "encounter.created":
        if (e.payload && !created.has(e.payload.encounter_id)) created.set(e.payload.encounter_id, e);
        break;
      case "encounter.deleted":
        deleted.add(e.payload.encounter_id);
        break;
      case "encounter.action":
        actions.push(e);
        break;
      case "encounter.noted":
      case "encounter.explained":
        later.push(e);
        break;
      case "concept.muted":
      case "concept.unmuted":
        mutes.push(e);
        break;
      case "reunion.dismissed":
        dismissals.push(e);
        break;
      case "edge.proposed":
        proposals.push(e);
        break;
      case "edge.confirmed":
      case "edge.rejected":
        statuses.push([e, position]);
        break;
      case "contribution.consent":
        consents.push({ scope: e.payload.scope, target: e.payload.target, at: Date.parse(e.ts) });
        break;
      default:
        break;
    }
  }

  const encounters = new Map<string, EncounterState>();
  for (const [encounterId, e] of created) {
    if (deleted.has(encounterId)) continue;
    const p = e.payload!;
    const conceptId = moved.get(encounterId) ?? p.concept_id;
    const rep = representative.get(conceptId);
    if (!rep) {
      warnings.push(`encounter ${encounterId} references unknown concept ${conceptId}`);
      continue;
    }
    const at = Date.parse(e.ts);
    encounters.set(encounterId, {
      id: encounterId,
      conceptId: rep,
      sourceId: p.source_id,
      locator: p.locator,
      selection: p.selection,
      explanation: p.explanation,
      flags: [...p.flags],
      device: e.device,
      createdAt: at,
      actions: [],
      lastAction: null,
      lastTouchedAt: at,
      everConfused: false,
    });
  }

  for (const e of later) {
    if (!e.payload) continue;
    const enc = encounters.get(e.payload.encounter_id);
    if (!enc) continue;
    if (e.type === "encounter.noted") {
      if (e.payload.text.trim()) enc.note = e.payload.text;
      else delete enc.note;
    } else if (enc.explanation.text === "") {
      // Only fills an encounter recorded without an explanation; one it already has is never replaced.
      enc.explanation = e.payload.explanation;
      enc.explainedLater = true;
      enc.explainedAt = Date.parse(e.ts);
      enc.lastTouchedAt = Math.max(enc.lastTouchedAt, enc.explainedAt);
    }
  }

  for (const a of actions) {
    if (!a.payload) continue;
    const enc = encounters.get(a.payload.encounter_id);
    if (!enc) continue;
    const at = Date.parse(a.ts);
    enc.actions.push(a.payload.detail ? { action: a.payload.action, at, detail: a.payload.detail } : { action: a.payload.action, at });
    enc.lastAction = a.payload.action;
    enc.lastTouchedAt = Math.max(enc.lastTouchedAt, at);
    if (gradeOf(a.payload.action) === 1) enc.everConfused = true;
  }

  const encountersByConcept = new Map<string, string[]>();
  const ordered = [...encounters.values()].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1));
  for (const enc of ordered) {
    const list = encountersByConcept.get(enc.conceptId);
    if (list) list.push(enc.id);
    else encountersByConcept.set(enc.conceptId, [enc.id]);
  }
  for (const c of concepts.values()) c.isPlaceholder = !encountersByConcept.has(c.id);

  for (const m of mutes) {
    const rep = representative.get(m.payload.concept_id);
    const c = rep ? concepts.get(rep) : undefined;
    if (c) c.muted = m.type === "concept.muted";
  }

  const dismissed = new Map<string, string[]>();
  for (const d of dismissals) {
    const rep = representative.get(d.payload.concept_id);
    if (!rep) continue;
    const list = dismissed.get(rep);
    if (!list) dismissed.set(rep, [d.payload.source_id]);
    else if (!list.includes(d.payload.source_id)) list.push(d.payload.source_id);
  }

  const edges = new Map<string, EdgeState>();
  /** Old edge id -> the new one and where its encounter moved, for relations whose explained concept moved with it. */
  const movedEdges = new Map<string, { id: string; at: number }>();
  for (const pe of proposals) {
    const p = pe.payload;
    // A relation found while explaining an encounter the reader moved belongs to the concept it moved to.
    const explained = p.evidence.encounter_id ? created.get(p.evidence.encounter_id)?.payload?.concept_id : undefined;
    const movedTo = p.evidence.encounter_id ? moved.get(p.evidence.encounter_id) : undefined;
    const end = (id: string): string => (movedTo && id === explained ? movedTo : id);
    const from = representative.get(end(p.from));
    const to = representative.get(end(p.to));
    // A status recorded before the move names the relation by its old ends.
    const oldFrom = representative.get(p.from);
    const oldTo = representative.get(p.to);
    if (from && to && oldFrom && oldTo && (oldFrom !== from || oldTo !== to))
      movedEdges.set(edgeId(oldFrom, p.rel, oldTo), { id: edgeId(from, p.rel, to), at: movedAt.get(p.evidence.encounter_id!)! });
    if (!from || !to || from === to) continue;
    const key = edgeId(from, p.rel, to);
    const evidence = p.evidence.encounter_id;
    const prev = edges.get(key);
    if (prev) {
      if (!prev.sources.includes(p.source)) prev.sources.push(p.source);
      prev.confidence = Math.max(prev.confidence, p.confidence);
      if (evidence && !prev.evidenceEncounterIds.includes(evidence)) prev.evidenceEncounterIds.push(evidence);
    } else {
      edges.set(key, {
        id: key,
        from,
        rel: p.rel,
        to,
        status: "proposed",
        confidence: p.confidence,
        sources: [p.source],
        evidenceEncounterIds: evidence ? [evidence] : [],
      });
    }
  }

  for (const [s, position] of statuses) {
    const parsed = parseEdgeId(s.payload.edge_id);
    if (!parsed) continue;
    const from = representative.get(parsed.from);
    const to = representative.get(parsed.to);
    if (!from || !to) continue;
    const key = edgeId(from, parsed.rel, to);
    const status = s.type === "edge.confirmed" ? "confirmed" : "rejected";
    const edge = edges.get(key);
    if (edge) edge.status = status;
    // Decided before the encounter moved: the decision goes with the relation.
    const movedTo = movedEdges.get(key);
    const movedEdge = movedTo && position < movedTo.at ? edges.get(movedTo.id) : undefined;
    if (movedEdge) movedEdge.status = status;
  }

  return {
    concepts,
    representative,
    aliases,
    encounters,
    encountersByConcept,
    sources,
    sourceIdentity: resolveSourceIdentity(sorted),
    edges,
    dismissed,
    consents,
    warnings,
  };
}
