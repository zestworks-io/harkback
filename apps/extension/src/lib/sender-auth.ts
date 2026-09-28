import type { Request } from "./messages";

export interface SenderInfo {
  id?: string;
  url?: string;
  tab?: { id?: number; incognito?: boolean; url?: string };
}

export type SenderKind = "content" | "page";

/** Extension pages are identified by URL; content scripts by the tab they run in. Anything else is ignored. */
export function senderKind(sender: SenderInfo, extensionId: string, extensionOrigin: string): SenderKind | null {
  if (sender.id !== extensionId) return null;
  if (sender.url !== undefined && sender.url.startsWith(`${extensionOrigin}/`)) return "page";
  if (sender.tab?.id !== undefined) return "content";
  return null;
}

const PAGE_ONLY = new Set<Request["type"]>(["delete-encounter", "backup-now", "settings-changed"]);

export function allowed(type: Request["type"], kind: SenderKind): boolean {
  return kind === "page" ? PAGE_ONLY.has(type) : !PAGE_ONLY.has(type);
}
