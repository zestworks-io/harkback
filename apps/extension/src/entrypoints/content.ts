import { defineContentScript } from "wxt/utils/define-content-script";
import { ContentApp } from "../lib/content/app";
import { browserRpc } from "../lib/content/rpc";
import { listenForTabMessages } from "../lib/content/tab-messages";

export default defineContentScript({
  matches: ["https://arxiv.org/*"],
  runAt: "document_idle",
  main() {
    const flag = globalThis as unknown as { __harkbackLoaded?: boolean };
    // The toolbar button and the shortcut may inject this script again into the same page.
    if (flag.__harkbackLoaded) return;
    flag.__harkbackLoaded = true;
    const app = new ContentApp(browserRpc, import.meta.env.MODE === "e2e" ? "open" : "closed");
    listenForTabMessages(app);
    void app.start().catch(() => undefined);
  },
});
