import { browser } from "wxt/browser";
import type { Request, ResponseMap } from "../messages";
import { pick, type Lang } from "../ui/strings";

/** Sends a request to the background page; a failed delivery is reported as `{ ok: false }` instead of throwing. */
export async function request<T extends Request>(msg: T): Promise<ResponseMap[T["type"]] | { ok: false; error?: string }> {
  try {
    return await browser.runtime.sendMessage(msg);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Must be the first await in a click handler: permission prompts need the click's user gesture. */
export function requestOrigins(origins: string[]): Promise<boolean> {
  return browser.permissions.request({ origins }).catch(() => false);
}

/** Runs a backup in the background page and returns the text to show. */
export async function backupNow(lang: Lang): Promise<string> {
  const r = await request({ type: "backup-now" });
  return r.ok
    ? pick(lang, "已备份。", "Backed up.")
    : `${pick(lang, "备份失败：", "Backup failed: ")}${"error" in r ? (r.error ?? "") : ""}`;
}
