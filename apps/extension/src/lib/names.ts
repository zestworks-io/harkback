import type { Lang } from "./ui/strings";

const CJK = /[㐀-鿿豈-﫿]/;

/** A name cut short while it was streamed ("Bilingual Evaluation Understu"): a longer name starts with it. */
function isCutOff(name: string, others: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return lower.length >= 8 && others.some((o) => o !== name && o.length - name.length <= 3 && o.toLowerCase().startsWith(lower));
}

/**
 * The names to show for a concept in the chosen language: Chinese names for "zh", the rest for "en".
 * Falls back to every name when none is written in that language, so a concept never shows up unnamed.
 */
export function localizeNames(canonical: string, aliases: readonly string[], lang: Lang): { name: string; aliases: string[] } {
  const seen = new Set<string>();
  const all = [canonical, ...aliases].map((n) => n.trim()).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  const clean = all.filter((n) => !isCutOff(n, all));
  const wanted = clean.filter((n) => CJK.test(n) === (lang === "zh"));
  const pool = wanted.length > 0 ? wanted : clean;
  const name = pool.includes(canonical) ? canonical : pool[0]!;
  return { name, aliases: pool.filter((n) => n !== name) };
}
