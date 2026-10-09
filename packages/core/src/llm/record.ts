import {
  CARD_LIMITS,
  parseEvent,
  type Domain,
  type HarkEvent,
  type Locator,
  type PayloadOf,
  type Rel,
  type Sensitivity,
  type SourceIds,
  type Tier,
} from "@harkback/spec";
import type { Candidate } from "../concepts/candidates";
import { THRESHOLDS } from "../constants";
import type { EventFactory } from "../events/factory";
import { ulid } from "../events/ids";
import { identityKey } from "../concepts/normalize";
import type { ParsedOutput } from "./parse-output";
import type { State } from "../events/state";

export type Resolution = { kind: "existing"; conceptId: string } | { kind: "new" } | { kind: "ask_user"; candidate: Candidate };

/**
 * The one existing concept in the card's domain that already has the card's canonical name (as its name or an alias), if exactly one does.
 * The canonical name is always English, so this joins a selection in another language to a concept first met in English. The card's
 * other aliases are not used: the model may list a broader term there, and joining on it would merge two different concepts.
 * A card whose domain is "other" says nothing about the field, so it never joins.
 */
function conceptNamedByCard(parsed: ParsedOutput, state: State): string | null {
  const card = parsed.card;
  if (!card || card.domain === "other") return null;
  const info = state.aliases.get(identityKey(card.canonical));
  // An ambiguous or abbreviation-derived key does not say which concept is meant.
  if (!info || info.ambiguous || info.derived) return null;
  const found = new Set<string>();
  for (const id of info.conceptIds) {
    const rep = state.representative.get(id) ?? id;
    if (state.concepts.get(rep)?.domain === card.domain) found.add(rep);
  }
  return found.size === 1 ? [...found][0]! : null;
}

export function resolveConcept(
  parsed: ParsedOutput,
  candidates: readonly Candidate[],
  state?: State,
  askThreshold: number = THRESHOLDS.askUserSimilarity,
): Resolution {
  if (parsed.card?.matchConceptId) return { kind: "existing", conceptId: parsed.card.matchConceptId };
  const named = state ? conceptNamedByCard(parsed, state) : null;
  if (named) return { kind: "existing", conceptId: named };
  const top = candidates[0];
  if (top && top.score >= askThreshold) return { kind: "ask_user", candidate: top };
  return { kind: "new" };
}

export interface RecordInput {
  factory: EventFactory;
  state: State;
  source: PayloadOf<"source.seen">;
  selection: string;
  locator: Locator;
  parsed: ParsedOutput;
  tier: Tier;
  model: string;
  /** Representative or member id of an existing concept; null creates a new concept. */
  conceptId: string | null;
  newId?: () => string;
}

function uniqueNames(candidates: readonly (string | undefined)[], known: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of candidates) {
    const name = raw?.trim().slice(0, CARD_LIMITS.maxNameLength);
    if (!name) continue;
    const key = identityKey(name);
    if (!key || known.has(key)) continue;
    known.add(key);
    out.push(name);
  }
  return out;
}

/** Trims a detected source to the limits of the event schema and applies `sensitivity`. */
export function clampSource(
  src: { source_id: string; ids: SourceIds; title: string; license: string },
  sensitivity: Sensitivity,
  byUser = false,
): PayloadOf<"source.seen"> {
  const { arxiv, doi, url } = src.ids;
  return {
    source_id: src.source_id,
    ids: {
      ...(arxiv !== undefined && { arxiv: arxiv.slice(0, 64) }),
      ...(doi !== undefined && { doi: doi.slice(0, 256) }),
      ...(url !== undefined && { url: url.slice(0, 2048) }),
    },
    title: src.title.slice(0, 500),
    license: src.license.slice(0, 64),
    sensitivity,
    ...(byUser && { by_user: true }),
  };
}

/**
 * Builds all events for one completed explanation. Edge directions:
 * `variant_of`: from is a variant or kind of to. `prerequisite`: from requires understanding to first.
 */
export function buildRecordEvents(input: RecordInput): HarkEvent[] {
  const { factory: f, state, parsed } = input;
  const newId = input.newId ?? (() => ulid());
  const selection = input.selection.trim().slice(0, CARD_LIMITS.maxSelectionLength);
  if (!identityKey(selection) || !/[\p{L}\p{N}]/u.test(selection)) throw new Error("empty selection");

  const out: HarkEvent[] = [];
  const card = parsed.card;

  const prevSource = state.sources.get(input.source.source_id);
  // Recording never downgrades: only an explicit user action may mark a sensitive source normal again.
  const source = clampSource(input.source, prevSource?.sensitivity === "sensitive" ? "sensitive" : input.source.sensitivity);
  if (!prevSource || prevSource.sensitivity !== source.sensitivity || prevSource.title !== source.title) {
    out.push(f.make("source.seen", source));
  }
  const locator: Locator = {
    exact: input.locator.exact.slice(0, 500),
    prefix: input.locator.prefix.slice(-64),
    suffix: input.locator.suffix.slice(0, 64),
    ...(input.locator.section !== undefined && { section: input.locator.section.slice(0, 200) }),
    ...(input.locator.t !== undefined && { t: input.locator.t }),
  };

  const known = new Set<string>();
  let conceptId: string;
  let domain: Domain;
  const selectionName = selection.slice(0, CARD_LIMITS.maxNameLength);

  if (input.conceptId) {
    const rep = state.representative.get(input.conceptId) ?? input.conceptId;
    const c = state.concepts.get(rep);
    if (!c) throw new Error(`unknown concept ${input.conceptId}`);
    conceptId = rep;
    domain = c.domain;
    for (const name of c.names) known.add(identityKey(name));
    const extra = uniqueNames([card?.canonical, ...(card?.aliases ?? []), selectionName], known).slice(0, CARD_LIMITS.maxAliases);
    for (const alias of extra) out.push(f.make("concept.alias_added", { concept_id: conceptId, alias }));
  } else {
    conceptId = newId();
    domain = card?.domain ?? "other";
    const canonical = card?.canonical ?? selectionName;
    known.add(identityKey(canonical));
    const aliases = uniqueNames([...(card?.aliases ?? []), selectionName], known).slice(0, CARD_LIMITS.maxAliases);
    out.push(f.make("concept.created", { concept_id: conceptId, canonical_name: canonical, aliases, domain }));
  }

  const encounterId = newId();
  out.push(
    f.make("encounter.created", {
      encounter_id: encounterId,
      concept_id: conceptId,
      source_id: input.source.source_id,
      locator,
      selection,
      explanation: {
        text: parsed.explanation,
        tier: input.tier,
        evidence_span: parsed.evidence,
        model: input.model.slice(0, CARD_LIMITS.maxModelNameLength),
      },
      flags: parsed.flags,
    }),
  );

  if (!card) return validated(out);

  const createdInBatch = new Map<string, string>();
  const lookup = (name: string): string => {
    const key = identityKey(name);
    if (known.has(key)) return conceptId;
    const batch = createdInBatch.get(key);
    if (batch) return batch;
    // Only reuse a concept from the same domain; same names across domains are different concepts.
    const sameDomain = state.aliases.get(key)?.conceptIds.find((cid) => state.concepts.get(cid)?.domain === domain);
    if (sameDomain) return sameDomain;
    const placeholderId = newId();
    createdInBatch.set(key, placeholderId);
    out.push(f.make("concept.created", { concept_id: placeholderId, canonical_name: name, aliases: [], domain }));
    return placeholderId;
  };
  const propose = (from: string, to: string, rel: Rel, confidence: number) => {
    if (from === to) return;
    out.push(f.make("edge.proposed", { from, to, rel, source: "llm_explain", confidence, evidence: { encounter_id: encounterId } }));
  };

  for (const name of card.broader) propose(conceptId, lookup(name), "variant_of", card.confidence.broader);
  for (const name of card.variants) propose(lookup(name), conceptId, "variant_of", card.confidence.variants);
  for (const name of card.prerequisites) propose(conceptId, lookup(name), "prerequisite", card.confidence.prerequisites);

  return validated(out);
}

/** Refuses to hand back events that sync and JSONL import would later reject. */
function validated(events: HarkEvent[]): HarkEvent[] {
  for (const e of events) {
    const r = parseEvent(e);
    if (r.kind !== "event") throw new Error(`invalid ${e.type} event: ${r.kind === "invalid" ? r.reason : r.kind}`);
  }
  return events;
}
