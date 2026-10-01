import type { Request } from "./messages";

export interface SenderInfo {
  id?: string;
  url?: string;
  tab?: { id?: number; incognito?: boolean; url?: string };
}

export type SenderKind = "content" | "page" | "reader";

/** Extension pages are identified by URL; content scripts by the tab they run in. Anything else is ignored. */
export function senderKind(sender: SenderInfo, extensionId: string, extensionOrigin: string): SenderKind | null {
  if (sender.id !== extensionId) return null;
  if (sender.url !== undefined && sender.url.startsWith(`${extensionOrigin}/`))
    return isReaderUrl(sender.url, extensionOrigin) ? "reader" : "page";
  if (sender.tab?.id !== undefined) return "content";
  return null;
}

const READER_PATH = "/reader.html";

function isReaderUrl(url: string, extensionOrigin: string): boolean {
  const rest = url.slice(extensionOrigin.length);
  return rest === READER_PATH || rest.startsWith(`${READER_PATH}?`) || rest.startsWith(`${READER_PATH}#`);
}

/** The PDF the reader page shows: site rules, source ids and history refer to it, not to the extension page. */
export function readerSource(readerUrl: string | undefined): string {
  if (!readerUrl) return "";
  try {
    const src = new URL(readerUrl).searchParams.get("src") ?? "";
    return /^(https?|file):/i.test(src) ? new URL(src).toString() : "";
  } catch {
    return "";
  }
}

const PAGE_ONLY = new Set<Request["type"]>([
  "delete-encounter",
  "review-answer",
  "merge-concepts",
  "add-alias",
  "reject-edge",
  "set-muted",
  "backup-now",
  "settings-changed",
]);

export function allowed(type: Request["type"], kind: SenderKind): boolean {
  return kind === "page" ? PAGE_ONLY.has(type) : !PAGE_ONLY.has(type);
}
