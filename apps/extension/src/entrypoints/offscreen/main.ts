import { browser } from "wxt/browser";

// Service workers cannot create blob URLs; this document creates one for each backup download.
browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const m = message as { type?: unknown; text?: unknown } | null;
  if (sender.id !== browser.runtime.id || m?.type !== "offscreen:blob-url" || typeof m.text !== "string") return false;
  const url = URL.createObjectURL(new Blob([m.text], { type: "application/x-ndjson" }));
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  sendResponse({ url });
  return false;
});
