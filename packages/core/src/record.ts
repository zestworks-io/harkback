import { CARD_LIMITS, type Domain, type HarkEvent, type Locator, type PayloadOf, type Rel, type Tier } from "@harkback/spec";
import type { Candidate } from "./candidates";
import { THRESHOLDS } from "./constants";
import type { EventFactory } from "./factory";
import { ulid } from "./ids";
import { identityKey } from "./normalize";
import type { ParsedOutput } from "./parse-output";
import type { State } from "./state";

export type Resolution =
  | { kind: "existing"; conceptId: string }
  | { kind: "new" }
  | { kind: "ask_user"; candidate: Candidate };

export function resolveConcept(
  parsed: ParsedOutput,
  candidates: readonly Candidate[],
  askThreshold: number = THRESHOLDS.askUserSimilarity,
): Resolution {
  if (parsed.card?.matchConceptId) return { kind: "existing", conceptId: parsed.card.matchConceptId };
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

/**
 * Builds all events for one completed explanation. Edge directions:
 * `variant_of`: from is a variant or kind of to. `prerequisite`: from requires understanding to first.
 */
export function buildRecordEvents(input: RecordInput): HarkEvent[] {
  const { factory: f, state, parsed } = input;
  const newId = input.newId ?? (() => ulid());
  const selection = input.selection.trim().slice(0, CARD_LIMITS.maxSelectionLength);
  if (!identityKey(selection)) throw new Error("empty selection");

  const out: HarkEvent[] = [];
  const card = parsed.card;

  const prevSource = state.sources.get(input.source.source_id);
  if (!prevSource || prevSource.sensitivity !== input.source.sensitivity || prevSource.title !== input.source.title) {
    out.push(f.make("source.seen", input.source));
  }

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
      locator: input.locator,
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

  if (!card) return out;

  const createdInBatch = new Map<string, string>();
  const lookup = (name: string): string => {
    const key = identityKey(name);
    if (known.has(key)) return conceptId;
    const batch = createdInBatch.get(key);
    if (batch) return batch;
    const info = state.aliases.get(key);
    const sameDomain = info?.conceptIds.find((cid) => state.concepts.get(cid)?.domain === domain);
    if (sameDomain) return sameDomain;
    if (info?.conceptIds[0]) return info.conceptIds[0];
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

  return out;
}
