import type { Lang } from "../../languages";
import { pages_zhTW } from "./zh-TW";
import { pages_ja } from "./ja";
import { pages_ko } from "./ko";
import { pages_es } from "./es";
import { pages_fr } from "./fr";
import { pages_de } from "./de";
import { pages_ptBR } from "./pt-BR";

/** Page text by language, keyed by the English text used in the page. */
export const PAGE_STRINGS: Partial<Record<Lang, Readonly<Record<string, string>>>> = {
  "zh-TW": pages_zhTW,
  ja: pages_ja,
  ko: pages_ko,
  es: pages_es,
  fr: pages_fr,
  de: pages_de,
  "pt-BR": pages_ptBR,
};
