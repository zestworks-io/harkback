import { DAY_MS } from "@harkback/core";
import type { Lang } from "./ui/languages";
import { pick } from "./ui/pick";

const HOUR_MS = 3_600_000;

/** "Due now", "Overdue by 2 days" or "Due in 3 days", with the date it falls on. */
export function dueText(dueAt: number, now: number, lang: Lang): string {
  const date = new Date(dueAt).toLocaleDateString(lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : lang, {
    month: "short",
    day: "numeric",
  });
  const diff = dueAt - now;
  if (diff <= 0) {
    const days = Math.floor(-diff / DAY_MS);
    if (days < 1) return pick(lang, "现在该复习了", "Due now");
    return days === 1
      ? pick(lang, "已逾期 1 天（{date}）", "Overdue by 1 day ({date})", { date })
      : pick(lang, "已逾期 {n} 天（{date}）", "Overdue by {n} days ({date})", { n: days, date });
  }
  if (diff < DAY_MS) {
    const hours = Math.max(1, Math.ceil(diff / HOUR_MS));
    return hours === 1 ? pick(lang, "1 小时后复习", "Due in 1 hour") : pick(lang, "{n} 小时后复习", "Due in {n} hours", { n: hours });
  }
  const days = Math.ceil(diff / DAY_MS);
  return days === 1
    ? pick(lang, "1 天后复习（{date}）", "Due in 1 day ({date})", { date })
    : pick(lang, "{n} 天后复习（{date}）", "Due in {n} days ({date})", { n: days, date });
}

/** "3 days" / "1 day", for the waits shown next to the review buttons. */
export function daysText(days: number, lang: Lang): string {
  return days === 1 ? pick(lang, "1 天", "1 day") : pick(lang, "{n} 天", "{n} days", { n: days });
}
