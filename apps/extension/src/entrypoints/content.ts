import { defineContentScript } from "wxt/utils/define-content-script";
import { ContentApp } from "../lib/content/app";
import { browserRpc } from "../lib/content/rpc";
import { listenForTabMessages } from "../lib/content/tab-messages";
import { createYouTubeSource } from "../lib/video/youtube-source";

export default defineContentScript({
  matches: ["https://arxiv.org/*"],
  runAt: "document_idle",
  main() {
    const flag = globalThis as unknown as { __harkbackLoaded?: boolean };
    // The toolbar button and the shortcut may inject this script again into the same page.
    if (flag.__harkbackLoaded) return;
    flag.__harkbackLoaded = true;
    // A YouTube page is read from its captions (when a video is open), not from its page text.
    const youtube = /(^|\.)youtube\.com$/.test(location.hostname);
    const app = new ContentApp(
      browserRpc,
      import.meta.env.MODE === "e2e" ? "open" : "closed",
      youtube ? createYouTubeSource(document) : undefined,
    );
    listenForTabMessages(app);
    void app.start().catch(() => undefined);
  },
});
