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
  "import-events",
  "import-zotero",
  "explain-imported",
  "review-answer",
  "check-answer",
  "merge-concepts",
  "add-alias",
  "resolve-alias",
  "reject-edge",
  "confirm-edge",
  "split-concept",
  "record-consent",
  "set-muted",
  "backup-now",
  "settings-changed",
]);

/** Unmarking from the lock on a page, or from the library; a page may already tell a whole site it is fine (`remember-site`). */
const EVERYWHERE = new Set<Request["type"]>(["mark-normal"]);

export function allowed(type: Request["type"], kind: SenderKind): boolean {
  if (EVERYWHERE.has(type)) return true;
  return kind === "page" ? PAGE_ONLY.has(type) : !PAGE_ONLY.has(type);
}
