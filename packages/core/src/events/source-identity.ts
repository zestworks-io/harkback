import type { HarkEvent, SourceIds } from "@harkback/spec";
import { MinUnionFind } from "./union-find";

const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/i;

/** One spelling per id: no version suffix on arXiv ids, lower-case DOIs, and arXiv's own DOI form as the arXiv id. */
export function normalizeSourceId(id: string): string {
  if (id.startsWith("arxiv:")) return id.replace(/v\d+$/, "");
  if (id.startsWith("doi:")) {
    const doi = id.toLowerCase();
    const m = ARXIV_DOI.exec(doi.slice(4));
    return m ? `arxiv:${m[1]!.replace(/v\d+$/, "")}` : doi;
  }
  return id;
}

/** The source a part belongs to: the repository of a GitHub issue or pull request, `github:owner/repo#12` -> `github:owner/repo`. */
export function parentSourceId(id: string): string | null {
  const at = id.startsWith("github:") ? id.indexOf("#") : -1;
  return at > 0 ? id.slice(0, at) : null;
}

/** The ids a source is known by, in the form source ids use: `arxiv:<id>` and `doi:<id>`. */
function idKeys(ids: SourceIds): string[] {
  const keys: string[] = [];
  if (ids.arxiv) keys.push(`arxiv:${ids.arxiv.replace(/v\d+$/, "")}`);
  if (ids.doi) {
    const doi = ids.doi.toLowerCase();
    keys.push(`doi:${doi}`);
    const m = ARXIV_DOI.exec(doi);
    if (m) keys.push(`arxiv:${m[1]!.replace(/v\d+$/, "")}`);
  }
  return keys;
}

/**
 * Maps every source id to one representative, so a paper seen as `arxiv:…` on one page and `doi:…` on another counts as
 * one source once an event names both ids (or the doi is arXiv's own `10.48550/arXiv.<id>` form). Source ids already
 * stored are never rewritten; only this map ties them together. `sorted` must already be in canonicalOrder.
 */
export function resolveSourceIdentity(sorted: readonly HarkEvent[]): Map<string, string> {
  const uf = new MinUnionFind();
  for (const e of sorted) {
    if (e.type !== "source.seen") continue;
    const keys = [normalizeSourceId(e.payload.source_id), ...idKeys(e.payload.ids)];
    for (const k of keys) uf.add(k);
    for (const k of keys.slice(1)) uf.union(keys[0]!, k);
  }
  const map = new Map<string, string>();
  for (const e of sorted) {
    if (e.type !== "source.seen") continue;
    for (const k of [normalizeSourceId(e.payload.source_id), ...idKeys(e.payload.ids)]) map.set(k, uf.find(k));
  }
  return map;
}
