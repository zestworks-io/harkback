/**
 * Licences as short codes: `cc-by-4.0`, `cc-by-nc-sa-4.0`, `cc0-1.0`, `public-domain`, `arxiv-nonexclusive`, or `unknown`.
 * Only openly licensed sources may go into the data commons.
 */
export const UNKNOWN_LICENSE = "unknown";

const CC = /creativecommons\.org\/licenses\/((?:by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd))\/(\d\.\d)/i;
const CC0 = /creativecommons\.org\/publicdomain\/zero\/(\d\.\d)/i;
const PD_MARK = /creativecommons\.org\/publicdomain\/mark\//i;
const ARXIV_NONEXCLUSIVE = /arxiv\.org\/licenses\/nonexclusive-distrib\//i;
const CODE = /^(cc-(?:by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd)-\d\.\d|cc0-\d\.\d|public-domain|arxiv-nonexclusive)$/;
const SPDX = /^(?:cc[- ]?(by(?:-(?:sa|nd|nc|nc-sa|nc-nd))?)[- ](\d\.\d)|cc0[- ](\d\.\d))$/i;

/** The licence a link or a written name stands for, such as `http://creativecommons.org/licenses/by/4.0/` or `CC BY 4.0`. */
export function licenseCode(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return UNKNOWN_LICENSE;
  let m = CC.exec(t);
  if (m) return `cc-${m[1]!.toLowerCase()}-${m[2]}`;
  if ((m = CC0.exec(t))) return `cc0-${m[1]}`;
  if (PD_MARK.test(t)) return "public-domain";
  if (ARXIV_NONEXCLUSIVE.test(t)) return "arxiv-nonexclusive";
  if (CODE.test(t.toLowerCase())) return t.toLowerCase();
  if ((m = SPDX.exec(t))) return m[1] ? `cc-${m[1].toLowerCase()}-${m[2]}` : `cc0-${m[3]}`;
  return UNKNOWN_LICENSE;
}

/** True for Creative Commons licences and the public domain: what the data commons accepts. */
export function isOpenLicense(license: string): boolean {
  return license.startsWith("cc-") || license.startsWith("cc0-") || license === "public-domain";
}
