const OPENABLE = /^(https?|file):/i;

/** The address alone: a PDF served without `.pdf` in its path is found by asking the tab (see `isPdf`). */
export function looksLikePdfUrl(url: string): boolean {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function readerUrl(readerPage: string, src: string, handoff?: string): string {
  const u = new URL(readerPage);
  u.searchParams.set("src", src);
  if (handoff) u.searchParams.set("h", handoff);
  return u.toString();
}

/**
 * Runs inside the PDF's own tab, where the file is on the same site and so can be downloaded with
 * the user's session and no extra permission. It must not use anything outside this function.
 */
export async function fetchAsDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(location.href, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface OpenDeps {
  /** Address of the reader page inside the extension. */
  readerPage: string;
  /** Whether the tab shows a PDF although its address does not say so. */
  isPdf(tabId: number, url: string): Promise<boolean>;
  /** The tab's own file as a data: URL, or null. */
  download(tabId: number): Promise<string | null>;
  stash(dataUrl: string): Promise<string>;
  navigate(tabId: number, url: string): Promise<void>;
}

/**
 * Sends a tab that shows a PDF to the reader page. The file is downloaded first, while the click still
 * lets the extension act on that tab; a local file is read by the reader itself. False means "not a PDF".
 */
export async function openReader(tab: { id?: number; url?: string }, deps: OpenDeps): Promise<boolean> {
  const { id, url } = tab;
  if (id === undefined || !url || !OPENABLE.test(url)) return false;
  if (!looksLikePdfUrl(url) && !(await deps.isPdf(id, url).catch(() => false))) return false;
  let handoff: string | undefined;
  if (!url.startsWith("file:")) {
    try {
      const data = await deps.download(id);
      if (data) handoff = await deps.stash(data);
    } catch {
      // The reader tries to download the file itself and explains if that fails too.
    }
  }
  await deps.navigate(id, readerUrl(deps.readerPage, url, handoff));
  return true;
}
