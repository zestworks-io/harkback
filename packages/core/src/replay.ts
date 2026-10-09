import type { EventOf, HarkEvent } from "@harkback/spec";
import { DEFAULT_AMBIGUOUS_ACRONYMS } from "./constants";
import { edgeId, parseEdgeId } from "./ids";
import { gradeOf } from "./grade";
import { canonicalOrder } from "./order";
import { resolveConcepts } from "./replay-concepts";
import type { EdgeState, EncounterState, SourceState, State } from "./state";

export interface ReplayOptions {
  ambiguousAcronyms?: ReadonlySet<string>;
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function replay(events: readonly HarkEvent[], options: ReplayOptions = {}): State {
  const sorted = canonicalOrder(events);
  const { concepts, representative, aliases, warnings } = resolveConcepts(sorted, options.ambiguousAcronyms ?? DEFAULT_AMBIGUOUS_ACRONYMS);

  const sources = new Map<string, SourceState>();
  const created = new Map<string, EventOf<"encounter.created">>();
  const deleted = new Set<string>();
  const actions: EventOf<"encounter.action">[] = [];
  const mutes: (EventOf<"concept.muted"> | EventOf<"concept.unmuted">)[] = [];
  const proposals: EventOf<"edge.proposed">[] = [];
  const statuses: (EventOf<"edge.confirmed"> | EventOf<"edge.rejected">)[] = [];

  for (const e of sorted) {
    switch (e.type) {
      case "source.seen": {
        const p = e.payload;
        const prev = sources.get(p.source_id);
        sources.set(p.source_id, {
          id: p.source_id,
          ids: { ...prev?.ids, ...definedOnly(p.ids) },
          title: p.title || prev?.title || "",
          license: p.license,
          // Sensitive is sticky: only the reader's own choice makes a source normal again, so a later, automatic record
          // (another device that never knew the source was sensitive) cannot expose it.
          sensitivity: prev?.sensitivity === "sensitive" && p.sensitivity === "normal" && !p.by_user ? "sensitive" : p.sensitivity,
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
      case "concept.muted":
      case "concept.unmuted":
        mutes.push(e);
        break;
      case "edge.proposed":
        proposals.push(e);
        break;
      case "edge.confirmed":
      case "edge.rejected":
        statuses.push(e);
        break;
      default:
        break;
    }
  }

  const encounters = new Map<string, EncounterState>();
  for (const [encounterId, e] of created) {
    if (deleted.has(encounterId)) continue;
    const p = e.payload!;
    const rep = representative.get(p.concept_id);
    if (!rep) {
      warnings.push(`encounter ${encounterId} references unknown concept ${p.concept_id}`);
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

  const edges = new Map<string, EdgeState>();
  for (const pe of proposals) {
    const p = pe.payload;
    const from = representative.get(p.from);
    const to = representative.get(p.to);
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

  for (const s of statuses) {
    const parsed = parseEdgeId(s.payload.edge_id);
    if (!parsed) continue;
    const from = representative.get(parsed.from);
    const to = representative.get(parsed.to);
    if (!from || !to) continue;
    const edge = edges.get(edgeId(from, parsed.rel, to));
    if (edge) edge.status = s.type === "edge.confirmed" ? "confirmed" : "rejected";
  }

  return { concepts, representative, aliases, encounters, encountersByConcept, sources, edges, warnings };
}
