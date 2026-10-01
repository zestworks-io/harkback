import { PAGE_STRINGS } from "./locales/pages";
import type { Lang } from "./languages";

/**
 * The text of a page in a language. Pages carry Simplified Chinese and English inline; every other language is looked up
 * by its English text and falls back to English. `{name}` placeholders are filled from `vars`.
 */
export function pick(lang: Lang, zh: string, en: string, vars?: Record<string, string | number>): string {
  const text = lang === "zh" ? zh : lang === "en" ? en : (PAGE_STRINGS[lang]?.[en] ?? en);
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}
