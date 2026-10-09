const HAN = /[㐀-鿿豈-﫿]/;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯]/;

/** The script each language is written in; any other language is written in Latin script. */
const SCRIPT: Record<string, RegExp> = {
  zh: HAN,
  "zh-TW": HAN,
  ja: new RegExp(`${KANA.source}|${HAN.source}`),
  ko: HANGUL,
  ru: /\p{Script=Cyrillic}/u,
  ar: /\p{Script=Arabic}/u,
  hi: /\p{Script=Devanagari}/u,
};
const NON_LATIN = new RegExp(
  `${HAN.source}|${KANA.source}|${HANGUL.source}|\\p{Script=Cyrillic}|\\p{Script=Arabic}|\\p{Script=Devanagari}`,
  "u",
);

const isIn = (name: string, lang: string): boolean => {
  const script = SCRIPT[lang];
  return script ? script.test(name) : !NON_LATIN.test(name);
};

/** A name cut short while it was streamed ("Bilingual Evaluation Understu"): a longer name starts with it. */
function isCutOff(name: string, others: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return lower.length >= 8 && others.some((o) => o !== name && o.length - name.length <= 3 && o.toLowerCase().startsWith(lower));
}

/**
 * The names to show for a concept in the chosen language (an `EXPLAIN_LANGUAGES` code): the names written in that language's script.
 * Falls back to every name when none is written in that language, so a concept never shows up unnamed.
 */
export function localizeNames(canonical: string, aliases: readonly string[], lang: string): { name: string; aliases: string[] } {
  const seen = new Set<string>();
  const all = [canonical, ...aliases].map((n) => n.trim()).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  const clean = all.filter((n) => !isCutOff(n, all));
  const wanted = clean.filter((n) => isIn(n, lang));
  const pool = wanted.length > 0 ? wanted : clean;
  const name = pool.includes(canonical) ? canonical : pool[0]!;
  return { name, aliases: pool.filter((n) => n !== name) };
}
