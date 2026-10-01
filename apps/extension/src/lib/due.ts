import { DAY_MS } from "@harkback/core";
import type { Lang } from "./ui/strings";

const HOUR_MS = 3_600_000;

/** "Due now", "Overdue by 2 days" or "Due in 3 days", with the date it falls on. */
export function dueText(dueAt: number, now: number, lang: Lang): string {
  const zh = lang === "zh";
  const date = new Date(dueAt).toLocaleDateString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
  const diff = dueAt - now;
  if (diff <= 0) {
    const days = Math.floor(-diff / DAY_MS);
    if (days < 1) return zh ? "现在该复习了" : "Due now";
    return zh ? `已逾期 ${days} 天（${date}）` : `Overdue by ${days} ${days === 1 ? "day" : "days"} (${date})`;
  }
  if (diff < DAY_MS) {
    const hours = Math.max(1, Math.ceil(diff / HOUR_MS));
    return zh ? `${hours} 小时后复习` : `Due in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.ceil(diff / DAY_MS);
  return zh ? `${days} 天后复习（${date}）` : `Due in ${days} ${days === 1 ? "day" : "days"} (${date})`;
}

/** "3 days" / "1 day", for the waits shown next to the review buttons. */
export function daysText(days: number, lang: Lang): string {
  return lang === "zh" ? `${days} 天` : `${days} ${days === 1 ? "day" : "days"}`;
}
