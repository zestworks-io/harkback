import type { Lang } from "./ui/languages";
import { pick } from "./ui/pick";

/** The toolbar icon's badge text and tooltip for a number of concepts due for review. */
export function badgeFor(due: number, language: Lang): { text: string; title: string } {
  const title = pick(language, "Harkback: 扫描此页", "Harkback: scan this page");
  if (!Number.isFinite(due) || due < 1) return { text: "", title };
  const n = Math.floor(due);
  return { text: n > 99 ? "99+" : String(n), title: `${title}\n${pick(language, "{n} 个待复习", "{n} to review", { n })}` };
}
