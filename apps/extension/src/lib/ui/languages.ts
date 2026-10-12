/** Languages the interface is available in. English and Simplified Chinese are written inline; the others come from `locales/`. */
export const UI_LANGUAGES = [
  { code: "zh", native: "简体中文", dir: "ltr" },
  { code: "en", native: "English", dir: "ltr" },
  { code: "zh-TW", native: "繁體中文", dir: "ltr" },
  { code: "ja", native: "日本語", dir: "ltr" },
  { code: "ko", native: "한국어", dir: "ltr" },
  { code: "es", native: "Español", dir: "ltr" },
  { code: "fr", native: "Français", dir: "ltr" },
  { code: "de", native: "Deutsch", dir: "ltr" },
  { code: "pt-BR", native: "Português (Brasil)", dir: "ltr" },
  { code: "ar", native: "العربية", dir: "rtl" },
] as const;

export type Lang = (typeof UI_LANGUAGES)[number]["code"];

export const isLang = (v: unknown): v is Lang => UI_LANGUAGES.some((l) => l.code === v);

/** A source title in the quotes of the language: book-title marks for Chinese, Japanese and Korean, guillemets for Arabic, curly quotes otherwise. */
export const quoteTitle = (title: string, lang: Lang): string =>
  lang === "zh" || lang === "zh-TW" || lang === "ja" || lang === "ko" ? `《${title}》` : lang === "ar" ? `«${title}»` : `“${title}”`;

/** The writing direction of the interface in a language. */
export const dirOf = (lang: Lang): "ltr" | "rtl" => UI_LANGUAGES.find((l) => l.code === lang)?.dir ?? "ltr";

/** The language tag for the `lang` attribute: Simplified Chinese is `zh-CN`, the rest are their own code. */
export const htmlLang = (lang: Lang): string => (lang === "zh" ? "zh-CN" : lang);

const RULES = new Map<string, Intl.PluralRules>();
const rulesFor = (lang: Lang): Intl.PluralRules => {
  const tag = htmlLang(lang);
  if (!RULES.has(tag)) RULES.set(tag, new Intl.PluralRules(tag));
  return RULES.get(tag)!;
};

/**
 * Picks the form of a count by the language's plural rules. A group `{n#one=…|few=…|other=…}` is replaced by the form
 * for the number `n` (`other` when the language has no form for it), with `#` standing for the number itself.
 */
function pluralize(text: string, vars: Record<string, string | number>, lang: Lang): string {
  return text.replace(/\{(\w+)#([^}]*)\}/g, (m, name: string, body: string) => {
    if (vars[name] === undefined || vars[name] === null) return m;
    const n = Number(vars[name]);
    const forms = new Map(body.split("|").map((f) => [f.slice(0, f.indexOf("=")), f.slice(f.indexOf("=") + 1)] as const));
    const form = forms.get(rulesFor(lang).select(n)) ?? forms.get("other") ?? "";
    return form.replace(/#/g, String(n));
  });
}

/**
 * Fills `{name}` placeholders and plural groups. In a right-to-left language each text that is put in (a term, a title, a quote) is
 * isolated, so a Latin name inside an Arabic sentence cannot pull the punctuation around it out of place.
 */
export function fillVars(text: string, vars: Record<string, string | number>, lang: Lang): string {
  const rtl = dirOf(lang) === "rtl";
  return pluralize(text, vars, lang).replace(/\{(\w+)\}/g, (m, name: string) => {
    if (vars[name] === undefined || vars[name] === null) return m;
    const value = String(vars[name]);
    return rtl && typeof vars[name] === "string" ? `\u2068${value}\u2069` : value;
  });
}

/** Sets `lang` and `dir` on an element, so the browser picks the right fonts, quotes and layout direction. */
export function applyLanguage(el: HTMLElement, lang: Lang): void {
  el.lang = htmlLang(lang);
  el.dir = dirOf(lang);
}
