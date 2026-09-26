import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { ContentApp } from "../lib/content/app";
import { browserRpc } from "../lib/content/rpc";
import type { TabMessage } from "../lib/messages";

export default defineContentScript({
  matches: ["https://arxiv.org/*"],
  runAt: "document_idle",
  main() {
    const flag = globalThis as unknown as { __harkbackLoaded?: boolean };
    // The toolbar button and the shortcut may inject this script again into the same page.
    if (flag.__harkbackLoaded) return;
    flag.__harkbackLoaded = true;
    const app = new ContentApp(browserRpc, import.meta.env.MODE === "e2e" ? "open" : "closed");
    browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return false;
      const m = message as TabMessage | null;
      if (m?.type === "hello") sendResponse(true);
      else if (m?.type === "activate") void app.activate();
      else if (m?.type === "explain-selection") void app.explainSelection();
      return false;
    });
    void app.start().catch(() => undefined);
  },
});
