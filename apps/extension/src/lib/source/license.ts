import { licenseCode, UNKNOWN_LICENSE } from "@harkback/core";

const LICENSE_METAS = new Set(["citation_license", "dc.rights", "dcterms.license", "dcterms.rights", "dc.rights.license"]);

/** The page's licence, from arXiv's licence link, a `rel="license"` link, or Dublin Core and citation metadata. */
export function licenseFromDocument(doc: Document): string {
  const candidates = [
    ...[...doc.querySelectorAll('.abs-license a[href], a[title="Rights to this article"]')].map((a) => a.getAttribute("href")),
    ...[...doc.querySelectorAll('link[rel~="license"], a[rel~="license"]')].map((a) => a.getAttribute("href")),
    ...[...doc.querySelectorAll("meta[name][content]")]
      .filter((m) => LICENSE_METAS.has(m.getAttribute("name")!.toLowerCase()))
      .map((m) => m.getAttribute("content")),
  ];
  for (const c of candidates) {
    const code = licenseCode(c);
    if (code !== UNKNOWN_LICENSE) return code;
  }
  return UNKNOWN_LICENSE;
}
