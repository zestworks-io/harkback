import type { Domain, HarkEvent } from "@harkback/spec";
import { DEFAULT_AMBIGUOUS_ACRONYMS } from "./constants";
import { acronymOf, identityKey, normalizeName } from "./normalize";
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
  const warnings: string[] = [];

  for (const e of sorted) {
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
    } else if (e.type === "concept.merged") {
      merges.push([e.payload.from, e.payload.into]);
    }
  }

  for (const [conceptId, alias] of extraAliases) {
    const c = raw.get(conceptId);
    if (c) c.aliases.push(alias);
    else warnings.push(`alias for unknown concept ${conceptId}`);
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
      members: memberIds,
      muted: false,
      isPlaceholder: true,
    });
  }

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
    info.ambiguous =
      domains.size > 1 || ambiguousAcronyms.has(info.key.toLowerCase()) || (derivedKeys.has(info.key) && info.conceptIds.length > 1);
  }

  return { concepts, representative, aliases, warnings };
}
