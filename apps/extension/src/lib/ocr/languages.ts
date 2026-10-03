/** English is built into the extension; every other language is downloaded when the user asks for it. */
export const BUNDLED_LANGUAGE = "eng";
export const DEFAULT_LANGUAGES: readonly string[] = [BUNDLED_LANGUAGE];

/** Packs come from jsDelivr, which serves them with open CORS headers, so no host permission is needed to fetch them. */
export const PACK_HOST_NAME = "cdn.jsdelivr.net";
const PACK_VERSION = "1.0.0";

export interface OcrLanguage {
  /** The Tesseract code, such as `chi_sim`. */
  code: string;
  native: string;
  /** Size of the download in bytes. */
  size: number;
  /** SHA-256 of the downloaded file; a pack that does not match is thrown away. */
  sha256: string;
}

/** Chinese first, then the languages the interface speaks, then a few more. Each pack is the "best" model, integer-quantised. */
export const OCR_LANGUAGES: readonly OcrLanguage[] = [
  { code: "chi_sim", native: "简体中文", size: 1718768, sha256: "b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c" },
  { code: "chi_tra", native: "繁體中文", size: 1656239, sha256: "11fe2610dab05d8a880d02f193ce70203f4c4bbe061b987d5529a2c038a22743" },
  { code: "jpn", native: "日本語", size: 2030256, sha256: "2b63ebfbf1484de4a08ce53b29ef98a1c17658a93cbd38acb665d7d316d0be88" },
  { code: "kor", native: "한국어", size: 1572336, sha256: "78c21276ab14c9bb734d83be1055d9fe5469a4e7e977c51ad385be5737e61126" },
  { code: "spa", native: "Español", size: 2100190, sha256: "40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb" },
  { code: "fra", native: "Français", size: 707406, sha256: "d611139672b3752c7097e671e4a1d9209dfd37f2aeb081ef6487fba3351e9255" },
  { code: "deu", native: "Deutsch", size: 1333102, sha256: "306c4280d0cbed46fbff727486bd43b92730181bae80f56941a091f363bdf28b" },
  { code: "por", native: "Português", size: 1392239, sha256: "dacebc1386ddaaf8389f81094236cca0d690897cde693d48cbdaa881c86e2b4c" },
  { code: "ita", native: "Italiano", size: 1660998, sha256: "f702fcfad297ce028ede3626d1467b67939f23ff23595f9badd54681cf25a4d3" },
  { code: "rus", native: "Русский", size: 2679598, sha256: "f51f5edc992249ff9b70a227b22f242dfa47b2b1bbc7ae0ea74908640c101f6a" },
  { code: "ara", native: "العربية", size: 1661906, sha256: "f4746c44b02342dd5b3d4f0198000f47d7c49f1a229e63e0f436c0592dcd9639" },
  { code: "hin", native: "हिन्दी", size: 1389692, sha256: "f3b6a0d320df38d886178cdd727b90dbf9df3db053adb32bd9cf73f0463cda07" },
  { code: "tha", native: "ไทย", size: 896631, sha256: "4550a5505184d1b79cf10416d5b19e643001d95411d5e717954dd26feef3ae74" },
  { code: "vie", native: "Tiếng Việt", size: 1423003, sha256: "2284f610f262a1b19ec8df9f196b9ff6ce38ddb4a66329e998941df4b8961c8d" },
];

export const languageByCode = (code: string): OcrLanguage | undefined => OCR_LANGUAGES.find((l) => l.code === code);

export const packUrl = (code: string): string =>
  `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${code}@${PACK_VERSION}/4.0.0_best_int/${code}.traineddata.gz`;

/** The label for a code in its own language; English is not in the download list. */
export const languageName = (code: string): string => (code === BUNDLED_LANGUAGE ? "English" : (languageByCode(code)?.native ?? code));

/** The codes in the order Tesseract expects, with no repeats and nothing unknown; English when nothing is left. */
export function normalizeLanguages(codes: readonly string[]): string[] {
  const known = new Set([BUNDLED_LANGUAGE, ...OCR_LANGUAGES.map((l) => l.code)]);
  const out = [...new Set(codes.filter((c) => known.has(c)))];
  return out.length > 0 ? out : [...DEFAULT_LANGUAGES];
}
