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
    else if (m?.type === "explain-selection") void app.explainSelection();
    return false;
  });
}
