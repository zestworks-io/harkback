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

const ARXIV_PDF =
  /^https?:\/\/(?:www\.|export\.)?arxiv\.org\/pdf\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)(?:\.pdf)?(?:[?#]|$)/i;

/** The readable HTML version of an arXiv PDF address: the browser's PDF viewer has no page text to explain from. */
export function arxivHtmlUrl(url: string): string | null {
  const id = ARXIV_PDF.exec(url)?.[1];
  return id ? `https://arxiv.org/html/${id}` : null;
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

export interface PdfFacts {
  url: string;
  /** The title in the PDF's own metadata. */
  title: string;
  firstPageText: string;
  metadataDoi?: string;
  /** Hex digest of the file; identifies a local file whose address says nothing about its contents. */
  contentHash?: string;
}

const ARXIV_STAMP = /arXiv:\s*(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i;
const LABELLED_DOI = /(?:\bdoi\b\s*[:=]?\s*|doi\.org\/)(10\.\d{4,9}\/[^\s"<>]+)/i;

function normalizeDoi(raw: string): string {
  return raw
    .replace(/^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)/i, "")
    .replace(/[.,;:)\]}]+$/, "")
    .toLowerCase();
}

function pdfTitle(f: PdfFacts): string {
  const fromMeta = f.title.replace(/\s+/g, " ").trim();
  if (fromMeta) return fromMeta;
  try {
    const name = new URL(f.url).pathname.split("/").pop() ?? "";
    return decodeURIComponent(name).replace(/\.pdf$/i, "");
  } catch {
    return "";
  }
}

export function detectPdfSource(f: PdfFacts): DetectedSource {
  const arxiv = arxivIdFromUrl(f.url) ?? ARXIV_STAMP.exec(f.firstPageText)?.[1] ?? null;
  const rawDoi = f.metadataDoi ?? LABELLED_DOI.exec(f.firstPageText)?.[1] ?? null;
  const doi = rawDoi ? normalizeDoi(rawDoi) : null;
  const local = f.url.startsWith("file:");
  const cleaned = local ? null : cleanUrl(f.url);
  const source_id = arxiv ? `arxiv:${arxiv}` : doi ? `doi:${doi}` : local ? `pdf:sha256:${f.contentHash ?? ""}` : `url:${cleaned}`;
  return {
    source_id,
    // A local path names the user's folders; keep it out of the record.
    ids: { ...(cleaned ? { url: cleaned } : {}), ...(arxiv ? { arxiv } : {}), ...(doi ? { doi } : {}) },
    title: pdfTitle(f),
    license: "unknown",
  };
}
