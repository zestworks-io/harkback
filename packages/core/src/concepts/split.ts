import { CARD_LIMITS, type HarkEvent } from "@harkback/spec";
import { createEventFactory, type EventFactory } from "../events/factory";
import { replay } from "../events/replay";
import { identityKey } from "./normalize";

export interface SplitInput {
  conceptId: string;
  /** Encounters to move to the new concept. */
  encounterIds: readonly string[];
  /** Names to take off the concept and give to the new one. */
  names: readonly string[];
  /** The new concept's name. */
  newName: string;
}

export type SplitPlan =
  | { ok: true; conceptId: string; build: (f: EventFactory) => HarkEvent[] }
  /** `invalid`: the input does not fit the concept. `rejoins`: a name both still share would join them again. */
  | { ok: false; reason: "invalid" | "rejoins" };

/**
 * Splits part of a concept off into a new one: the chosen encounters move to it, and the chosen names move with them. A name
 * that is the canonical name of a concept merged in brings that concept along by undoing its merges. The plan is replayed on
 * top of `events` first, and refused when the two would end up as one concept again.
 */
export function planSplit(events: readonly HarkEvent[], input: SplitInput, newId: string): SplitPlan {
  const state = replay(events);
  const rep = state.representative.get(input.conceptId);
  const concept = rep ? state.concepts.get(rep) : undefined;
  const newName = input.newName.trim().slice(0, CARD_LIMITS.maxNameLength);
  if (!rep || !concept || !newName) return { ok: false, reason: "invalid" };
  const encounterIds = [...new Set(input.encounterIds)];
  if (encounterIds.some((id) => state.encounters.get(id)?.conceptId !== rep)) return { ok: false, reason: "invalid" };

  const ownNames = new Map(concept.names.map((n) => [identityKey(n), n]));
  const nameKeys = [...new Set(input.names.map(identityKey))];
  // The concept keeps its own name; every name moved must be one of its names.
  if (nameKeys.some((k) => !ownNames.has(k) || k === identityKey(concept.canonicalName))) return { ok: false, reason: "invalid" };
  if (encounterIds.length === 0 && nameKeys.length === 0) return { ok: false, reason: "invalid" };

  const canonicalOf = new Map<string, string>();
  for (const e of events) if (e.type === "concept.created") canonicalOf.set(e.payload.concept_id, e.payload.canonical_name);
  const moving = new Set(concept.members.filter((m) => m !== rep && nameKeys.includes(identityKey(canonicalOf.get(m) ?? ""))));
  // Only the merges between a member that moves and one that stays are undone.
  let merges: [string, string][] = [];
  for (const e of events)
    if (e.type === "concept.merged") merges.push([e.payload.from, e.payload.into]);
    else if (e.type === "concept.unmerged") {
      const { from, into } = e.payload;
      merges = merges.filter(([a, b]) => !((a === from && b === into) || (a === into && b === from)));
    }
  merges = merges.filter(([a, b]) => concept.members.includes(a) && concept.members.includes(b));
  const mergedPairs = merges.filter(([a, b]) => moving.has(a) !== moving.has(b));
  const movingNames = new Set([...moving].map((m) => identityKey(canonicalOf.get(m)!)));
  const aliases = nameKeys.filter((k) => k !== identityKey(newName) && !movingNames.has(k)).map((k) => ownNames.get(k)!);

  let stranded: string[] = [];
  const build = (f: EventFactory): HarkEvent[] => [
    f.make("concept.created", { concept_id: newId, canonical_name: newName, aliases, domain: concept.domain }),
    // Sent for every member: the name may have been given to any of them.
    ...concept.members
      .filter((m) => !moving.has(m))
      .flatMap((m) => nameKeys.map((k) => f.make("concept.alias_removed", { concept_id: m, alias: ownNames.get(k)! }))),
    ...mergedPairs.map(([from, into]) => f.make("concept.unmerged", { from, into })),
    ...[...moving].map((m) => f.make("concept.merged", { from: m, into: newId })),
    ...stranded.map((m) => f.make("concept.merged", { from: m, into: rep })),
    ...encounterIds.map((id) => f.make("encounter.moved", { encounter_id: id, concept_id: newId })),
  ];

  let seq = 0;
  const factory = createEventFactory({ device: "dev_split", nextSeq: () => ++seq });
  // A member that stays but was joined to the rest only through one that moves is merged back, so it stays too. One joined
  // by a name they share needs nothing, and is not tied with a merge it never had.
  const first = replay([...events, ...build(factory)]);
  const sideOf = (id: string) => first.representative.get(id);
  stranded = concept.members.filter((m) => !moving.has(m) && sideOf(m) !== sideOf(rep) && sideOf(m) !== sideOf(newId));
  const trial = stranded.length > 0 ? replay([...events, ...build(factory)]) : first;
  const kept = trial.representative.get(rep);
  const split = trial.representative.get(newId);
  if (!kept || !split || kept === split) return { ok: false, reason: "rejoins" };
  return { ok: true, conceptId: newId, build };
}
