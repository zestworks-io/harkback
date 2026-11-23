import { parseArxivHtml, type ArxivHtml } from "./formula-match";

export type HtmlLookup = { kind: "ok"; html: ArxivHtml } | { kind: "none" };

interface Deps {
  fetch: typeof fetch;
  /** Whether a site rule turns arxiv.org off, in which case nothing is asked of it. */
  siteOff(): Promise<boolean>;
}

const ATTEMPT_MS = 20_000;

/**
 * The arXiv HTML version of a paper, fetched once per paper for as long as the reader is open, for the formulas a PDF only
 * has as loose characters. The reader may fetch arxiv.org because the extension's content script runs there, which grants
 * the host; no other permission is asked for. A paper without an HTML version, or any failure, gives "none"; only an
 * answer from arXiv is kept, so a lookup that timed out, or ran while arxiv.org was turned off, is tried again.
 */
export function createArxivHtml(deps: Deps): (arxivId: string) => Promise<HtmlLookup> {
  const cache = new Map<string, Promise<HtmlLookup>>();
  /** `keep`: the answer holds for the reader's life (the page, or arXiv saying there is none); a failure is asked again. */
  const load = async (id: string): Promise<{ result: HtmlLookup; keep: boolean }> => {
    if (await deps.siteOff()) return { result: { kind: "none" }, keep: false };
    const url = `https://arxiv.org/html/${id}`;
    try {
      const res = await deps.fetch(url, { credentials: "omit", signal: AbortSignal.timeout(ATTEMPT_MS) });
      if (!res.ok) return { result: { kind: "none" }, keep: res.status === 404 || res.status === 410 };
      return { result: { kind: "ok", html: parseArxivHtml(await res.text(), url) }, keep: true };
    } catch {
      return { result: { kind: "none" }, keep: false };
    }
  };
  return (id) => {
    let hit = cache.get(id);
    if (!hit) {
      hit = load(id).then(({ result, keep }) => {
        if (!keep) cache.delete(id);
        return result;
      });
      cache.set(id, hit);
    }
    return hit;
  };
}
