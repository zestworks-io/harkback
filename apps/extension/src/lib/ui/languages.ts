/** Languages the interface is available in. English and Simplified Chinese are written inline; the others come from `locales/`. */
export const UI_LANGUAGES = [
  { code: "zh", native: "简体中文" },
  { code: "en", native: "English" },
  { code: "zh-TW", native: "繁體中文" },
  { code: "ja", native: "日本語" },
  { code: "ko", native: "한국어" },
  { code: "es", native: "Español" },
  { code: "fr", native: "Français" },
  { code: "de", native: "Deutsch" },
  { code: "pt-BR", native: "Português (Brasil)" },
] as const;

export type Lang = (typeof UI_LANGUAGES)[number]["code"];

export const isLang = (v: unknown): v is Lang => UI_LANGUAGES.some((l) => l.code === v);

/** A source title in the quotes of the language: book-title marks for Chinese, Japanese and Korean, curly quotes otherwise. */
export const quoteTitle = (title: string, lang: Lang): string =>
  lang === "zh" || lang === "zh-TW" || lang === "ja" || lang === "ko" ? `《${title}》` : `“${title}”`;
