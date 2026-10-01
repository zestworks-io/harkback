import type { Lang } from "../../languages";
import type { StringKey } from "../../strings";
import { ui_zhTW } from "./zh-TW";
import { ui_ja } from "./ja";
import { ui_ko } from "./ko";
import { ui_es } from "./es";
import { ui_fr } from "./fr";
import { ui_de } from "./de";
import { ui_ptBR } from "./pt-BR";

/** Text of the explain card and reunion hints by language; keys missing here fall back to English. */
export const UI_STRINGS: Partial<Record<Lang, Readonly<Partial<Record<StringKey, string>>>>> = {
  "zh-TW": ui_zhTW,
  ja: ui_ja,
  ko: ui_ko,
  es: ui_es,
  fr: ui_fr,
  de: ui_de,
  "pt-BR": ui_ptBR,
};
