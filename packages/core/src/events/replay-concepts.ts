import type { Domain, HarkEvent } from "@harkback/spec";
import { DEFAULT_AMBIGUOUS_ACRONYMS, MATCH_RULES } from "../constants";
import { acronymOf, identityKey, normalizeName } from "../concepts/normalize";
import type { AliasInfo, ConceptState } from "./state";
import { MinUnionFind } from "./union-find";

const MIN_ACRONYM = 3;

interface RawConcept {
  id: string;
  canonicalName: string;
  domain: Domain;
  aliases: string[];
}

export interface ConceptResolution {
  concepts: Map<string, ConceptState>;
  representative: Map<string, string>;
  aliases: Map<string, AliasInfo>;
  warnings: string[];
}

function proposalKey(conceptId: string, alias: string): string {
  return `${conceptId}\u0000${identityKey(alias)}`;
}

function domainKey(domain: Domain, name: string): string | null {
  const key = identityKey(name);
  return key ? `${domain}\u0000${key}` : null;
}

/** `sorted` must already be in canonicalOrder. */
export function resolveConcepts(
  sorted: readonly HarkEvent[],
  ambiguousAcronyms: ReadonlySet<string> = DEFAULT_AMBIGUOUS_ACRONYMS,
): ConceptResolution {
  const raw = new Map<string, RawConcept>();
  const extraAliases: [string, string][] = [];
  const merges: [string, string][] = [];
  const proposals: [string, string, number][] = [];
  const decided: [string, string, "confirmed" | "rejected", number][] = [];
  const warnings: string[] = [];

  for (const [position, e] of sorted.entries()) {
    if (e.type === "concept.created") {
      const p = e.payload;
      const prev = raw.get(p.concept_id);
      raw.set(p.concept_id, {
        id: p.concept_id,
        canonicalName: p.canonical_name,
        domain: p.domain,
        aliases: [...(prev?.aliases ?? []), ...p.aliases],
      });
    } else if (e.type === "concept.alias_added") {
      extraAliases.push([e.payload.concept_id, e.payload.alias]);
    } else if (e.type === "concept.alias_proposed") {
      proposals.push([e.payload.concept_id, e.payload.alias, position]);
    } else if (e.type === "concept.alias_confirmed" || e.type === "concept.alias_rejected") {
      decided.push([e.payload.concept_id, e.payload.alias, e.type === "concept.alias_confirmed" ? "confirmed" : "rejected", position]);
    } else if (e.type === "concept.merged") {
      merges.push([e.payload.from, e.payload.into]);
    }
  }

  for (const [conceptId, alias] of extraAliases) {
    const c = raw.get(conceptId);
    if (c) c.aliases.push(alias);
    else warnings.push(`alias for unknown concept ${conceptId}`);
  }

  // A proposed name matches nothing until confirmed; a rejected one is remembered so it is not proposed again.
  // A decision made for one member of an explicit merge counts for the others, so it survives a merge made after the proposal.
  const explicit = new MinUnionFind();
  for (const cid of raw.keys()) explicit.add(cid);
  for (const [from, into] of merges) if (raw.has(from) && raw.has(into)) explicit.union(from, into);
  const decisions = new Map<string, { decision: "confirmed" | "rejected"; position: number }>();
  for (const [conceptId, alias, decision, position] of decided)
    decisions.set(proposalKey(explicit.find(conceptId), alias), { decision, position });
  const pending: [string, string][] = [];
  const rejected: [string, string][] = [];
  for (const [conceptId, alias, position] of proposals) {
    const c = raw.get(conceptId);
    if (!c) {
      warnings.push(`alias proposal for unknown concept ${conceptId}`);
      continue;
    }
    // Only a decision made after the proposal counts, so a name rejected earlier can be proposed again.
    const made = decisions.get(proposalKey(explicit.find(conceptId), alias));
    const decision = made && made.position > position ? made.decision : undefined;
    if (decision === "confirmed") c.aliases.push(alias);
    else if (decision === "rejected") rejected.push([conceptId, alias]);
    else pending.push([conceptId, alias]);
  }

  const ids = [...raw.keys()].sort();
  const uf = new MinUnionFind();
  for (const cid of ids) uf.add(cid);

  for (const [from, into] of merges) {
    if (raw.has(from) && raw.has(into)) uf.union(from, into);
    else warnings.push(`merge with unknown concept ${from} -> ${into}`);
  }

  const byCanonical = new Map<string, string[]>();
  for (const cid of ids) {
    const c = raw.get(cid)!;
    const key = domainKey(c.domain, c.canonicalName);
    if (!key) continue;
    const list = byCanonical.get(key);
    if (list) {
      uf.union(list[0]!, cid);
      list.push(cid);
    } else {
      byCanonical.set(key, [cid]);
    }
  }
  for (const cid of ids) {
    const c = raw.get(cid)!;
    for (const alias of c.aliases) {
      const key = domainKey(c.domain, alias);
      const hit = key ? byCanonical.get(key) : undefined;
      if (hit) uf.union(hit[0]!, cid);
    }
  }

  // An abbreviation and its full name are one concept ("LLM" / "Large Language Model"), unless several different
  // full names in the same domain share the abbreviation ("GNN": graph vs generative), which is left alone.
  const expansions = new Map<string, Map<string, string[]>>();
  for (const cid of ids) {
    const c = raw.get(cid)!;
    for (const name of [c.canonicalName, ...c.aliases]) {
      const acr = acronymOf(name);
      const key = acr && acr.length >= MIN_ACRONYM ? domainKey(c.domain, acr) : null;
      if (!key) continue;
      const byName = expansions.get(key) ?? new Map<string, string[]>();
      const owners = byName.get(identityKey(name)) ?? [];
      owners.push(cid);
      byName.set(identityKey(name), owners);
      expansions.set(key, byName);
    }
  }
  for (const [key, byName] of expansions) {
    const holders = byCanonical.get(key);
    if (!holders || byName.size !== 1) continue;
    for (const owners of byName.values()) for (const cid of owners) uf.union(holders[0]!, cid);
  }

  const representative = new Map<string, string>();
  const members = new Map<string, string[]>();
  for (const cid of ids) {
    const rep = uf.find(cid);
    representative.set(cid, rep);
    const list = members.get(rep);
    if (list) list.push(cid);
    else members.set(rep, [cid]);
  }

  const concepts = new Map<string, ConceptState>();
  for (const [rep, memberIds] of members) {
    const root = raw.get(rep)!;
    const seen = new Set<string>();
    const names: string[] = [];
    const addName = (name: string) => {
      const key = identityKey(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      names.push(name);
    };
    addName(root.canonicalName);
    for (const m of memberIds) {
      const c = raw.get(m)!;
      addName(c.canonicalName);
      c.aliases.forEach(addName);
    }
    concepts.set(rep, {
      id: rep,
      canonicalName: root.canonicalName,
      domain: root.domain,
      names,
      proposedAliases: [],
      rejectedAliases: [],
      members: memberIds,
      muted: false,
      isPlaceholder: true,
    });
  }

  const addTo = (list: "proposedAliases" | "rejectedAliases", conceptId: string, alias: string) => {
    const c = concepts.get(representative.get(conceptId) ?? conceptId);
    if (!c) return;
    const key = identityKey(alias);
    if (!key || c[list].some((n) => identityKey(n) === key)) return;
    if (list === "proposedAliases" && c.names.some((n) => identityKey(n) === key)) return;
    c[list].push(alias);
  };
  for (const [conceptId, alias] of pending) addTo("proposedAliases", conceptId, alias);
  for (const [conceptId, alias] of rejected) addTo("rejectedAliases", conceptId, alias);

  const aliases = new Map<string, AliasInfo>();
  for (const c of concepts.values()) {
    for (const name of c.names) {
      const key = identityKey(name);
      let info = aliases.get(key);
      if (!info) {
        const n = normalizeName(name);
        info = { key, norm: n.norm, script: n.script, display: name, conceptIds: [], ambiguous: false };
        aliases.set(key, info);
      }
      if (!info.conceptIds.includes(c.id)) info.conceptIds.push(c.id);
    }
  }
  const derivedKeys = new Set<string>();
  for (const c of concepts.values()) {
    for (const name of c.names) {
      const acr = acronymOf(name);
      if (!acr || acr.length < MIN_ACRONYM) continue;
      const key = identityKey(acr);
      let info = aliases.get(key);
      if (!info) {
        const n = normalizeName(acr);
        info = { key, norm: n.norm, script: n.script, display: acr, conceptIds: [], ambiguous: false, derived: true };
        aliases.set(key, info);
      }
      if (!info.conceptIds.includes(c.id)) {
        info.conceptIds.push(c.id);
        derivedKeys.add(key);
      }
    }
  }
  for (const info of aliases.values()) {
    info.conceptIds.sort();
    const domains = new Set(info.conceptIds.map((cid) => concepts.get(cid)!.domain));
    // A short key shared by several concepts is probably an abbreviation of each, even within one field.
    const sharedShort =
      info.key.length <= MATCH_RULES.shortAcronymMaxLength && /^[\p{Lu}\p{N}]+$/u.test(info.key) && info.conceptIds.length > 1;
    info.ambiguous =
      domains.size > 1 ||
      ambiguousAcronyms.has(info.key.toLowerCase()) ||
      (derivedKeys.has(info.key) && info.conceptIds.length > 1) ||
      sharedShort;
  }

  return { concepts, representative, aliases, warnings };
}
