import type { SourceIds } from "@harkback/spec";

const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|spm|ref|ref_src|_hsenc|_hsmi|mkt_tok)$/i;
const ARXIV_URL = /^https?:\/\/(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i;

export interface DetectedSource {
  source_id: string;
  ids: SourceIds;
  title: string;
  license: string;
}

export function cleanUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  const s = u.toString();
  return s.endsWith("?") ? s.slice(0, -1) : s;
}

export function arxivIdFromUrl(url: string): string | null {
  return ARXIV_URL.exec(url)?.[1] ?? null;
}

export function isArxivUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "arxiv.org" || host.endsWith(".arxiv.org");
  } catch {
    return false;
  }
}

function meta(doc: Document, selector: string): string | null {
  return doc.querySelector(selector)?.getAttribute("content")?.trim() || null;
}

export function detectSource(url: string, doc: Document): DetectedSource {
  const cleaned = cleanUrl(url);
  const arxiv = arxivIdFromUrl(url) ?? meta(doc, 'meta[name="citation_arxiv_id"]')?.replace(/v\d+$/, "") ?? null;
  const doi =
    meta(doc, 'meta[name="citation_doi"]')
      ?.replace(/^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)/i, "")
      .toLowerCase() ?? null;
  let canonical: string | null = null;
  const href = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (href) {
    try {
      canonical = cleanUrl(new URL(href, url).toString());
    } catch {
      canonical = null;
    }
  }
  const source_id = arxiv ? `arxiv:${arxiv}` : doi ? `doi:${doi}` : `url:${canonical ?? cleaned}`;
  const title =
    doc.querySelector("h1.ltx_title_document")?.textContent ??
    meta(doc, 'meta[name="citation_title"]') ??
    meta(doc, 'meta[property="og:title"]') ??
    doc.title ??
    "";
  return {
    source_id,
    ids: { url: cleaned, ...(arxiv ? { arxiv } : {}), ...(doi ? { doi } : {}) },
    title: title.replace(/\s+/g, " ").trim(),
    license: "unknown",
  };
}
