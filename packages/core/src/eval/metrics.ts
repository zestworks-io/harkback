/** A share of judged items; `value` is null when nothing was judged, so an empty sample never reads as perfect. */
export interface Ratio {
  hits: number;
  total: number;
  value: number | null;
}

export function ratio(hits: number, total: number): Ratio {
  return { hits, total, value: total === 0 ? null : hits / total };
}

const countWhere = <T>(items: readonly T[], test: (item: T) => boolean): Ratio => ratio(items.filter(test).length, items.length);

/** Of the explanations recorded as defined in the source, the share whose paragraph really defines the term. */
export function definedInSourcePrecision(samples: readonly { tier: string; defined: boolean }[]): Ratio {
  return countWhere(
    samples.filter((s) => s.tier === "defined_in_source"),
    (s) => s.defined,
  );
}

/** Of the answers that quote evidence, the share whose quote is found on the page. */
export function evidenceVerificationRate(samples: readonly { evidence: string | null; verified: boolean }[]): Ratio {
  return countWhere(
    samples.filter((s) => s.evidence !== null),
    (s) => s.verified,
  );
}

export interface LabelledRelation {
  /** Gold concept labels; null when an end is not a labelled concept. */
  from: string | null;
  rel: string;
  to: string | null;
}

/**
 * Whether the gold relations contain a relation. `variant_of` means "is a kind of" and so is transitive: a variant of a
 * variant of X counts as a variant of X. An end that is not a labelled concept is wrong.
 */
export function relationJudge(gold: readonly LabelledRelation[]): (r: LabelledRelation) => boolean {
  const kindsOf = new Map<string, Set<string>>();
  for (const g of gold) {
    if (g.rel !== "variant_of" || g.from === null || g.to === null) continue;
    const set = kindsOf.get(g.from) ?? new Set<string>();
    set.add(g.to);
    kindsOf.set(g.from, set);
  }
  const ancestors = (label: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [...(kindsOf.get(label) ?? [])];
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(kindsOf.get(next) ?? []));
    }
    return seen;
  };
  const direct = new Set(gold.map((g) => `${g.from}\u0000${g.rel}\u0000${g.to}`));
  return (p) => {
    if (p.from === null || p.to === null) return false;
    if (p.rel === "variant_of") return ancestors(p.from).has(p.to);
    return direct.has(`${p.from}\u0000${p.rel}\u0000${p.to}`);
  };
}

/** Of the lookups joined to a concept already known, the share joined to the right one. */
export function sameConceptPrecision(joins: readonly { predicted: string | null; gold: string }[]): Ratio {
  return countWhere(joins, (j) => j.predicted === j.gold);
}

/** Of the reunion hints shown on a page, the share the page should show. */
export function reunionPrecision(shown: readonly { label: string | null; expected: readonly string[] }[]): Ratio {
  return countWhere(shown, (s) => s.label !== null && s.expected.includes(s.label));
}

export interface BCubed {
  precision: number;
  recall: number;
  f1: number;
}

/**
 * B-cubed scores of a clustering against gold clusters. Each item's precision is the share of its predicted cluster that
 * shares its gold cluster; its recall is the share of its gold cluster that shares its predicted cluster. Both are averaged
 * over items. An empty set scores zero.
 */
export function bCubed(items: readonly { predicted: string; gold: string }[]): BCubed {
  if (items.length === 0) return { precision: 0, recall: 0, f1: 0 };
  const count = (key: (i: { predicted: string; gold: string }) => string) => {
    const out = new Map<string, number>();
    for (const i of items) out.set(key(i), (out.get(key(i)) ?? 0) + 1);
    return out;
  };
  const predictedSize = count((i) => i.predicted);
  const goldSize = count((i) => i.gold);
  const both = count((i) => `${i.predicted}\u0000${i.gold}`);
  let precision = 0;
  let recall = 0;
  for (const i of items) {
    const shared = both.get(`${i.predicted}\u0000${i.gold}`)!;
    precision += shared / predictedSize.get(i.predicted)!;
    recall += shared / goldSize.get(i.gold)!;
  }
  precision /= items.length;
  recall /= items.length;
  return { precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall) };
}
