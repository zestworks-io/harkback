import { browser } from "wxt/browser";
import type { TabMessage } from "../messages";
import type { ContentApp } from "./app";

/** The toolbar button and the shortcut reach a page through these messages; only this extension may send them. */
export function listenForTabMessages(app: ContentApp): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    const m = message as TabMessage | null;
    if (m?.type === "hello") sendResponse(true);
    else if (m?.type === "activate") void app.activate();
    // The toolbar button and its shortcut: scan for reunions as before, and offer the preview without waiting for that scan.
    else if (m?.type === "preview") {
      void app.activate().catch(() => undefined);
      void app.offerPreview().catch(() => undefined);
    } else if (m?.type === "explain-selection") void app.explainSelection();
    return false;
  });
}
