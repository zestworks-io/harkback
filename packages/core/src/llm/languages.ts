export interface ExplainLanguage {
  /** BCP 47 tag. */
  code: string;
  /** The name used in prompts. */
  name: string;
  /** The name in the language itself, for pickers. */
  native: string;
}

/** Languages an explanation can be written in. The model does the writing, so adding one is a line here. */
export const EXPLAIN_LANGUAGES: readonly ExplainLanguage[] = [
  { code: "en", name: "English", native: "English" },
  { code: "zh", name: "Simplified Chinese", native: "简体中文" },
  { code: "zh-TW", name: "Traditional Chinese", native: "繁體中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "pt-BR", name: "Brazilian Portuguese", native: "Português (Brasil)" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "ar", name: "Arabic", native: "العربية" },
];

export const isExplainLanguage = (code: unknown): code is string => EXPLAIN_LANGUAGES.some((l) => l.code === code);

/** The prompt name of a language code; unknown codes fall back to English. */
export function explainLanguageName(code: string): string {
  return EXPLAIN_LANGUAGES.find((l) => l.code === code)?.name ?? "English";
}

const SCRIPT_OF: Record<string, RegExp> = {
  zh: /\p{Script=Han}/u,
  "zh-TW": /\p{Script=Han}/u,
  ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  ko: /[\p{Script=Hangul}\p{Script=Han}]/u,
  ru: /\p{Script=Cyrillic}/u,
  hi: /\p{Script=Devanagari}/u,
  ar: /\p{Script=Arabic}/u,
};

/**
 * Whether a name could be written in the language: it contains a letter of the language's script. English never fits, since a
 * card's canonical name is already English. A cheap guard against the model answering a translation in the wrong language.
 */
export function nameFitsLanguage(name: string, code: string): boolean {
  if (code === "en") return false;
  return (SCRIPT_OF[code] ?? /\p{Script=Latin}/u).test(name);
}
