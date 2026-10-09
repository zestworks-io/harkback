// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { ContentApp } from "../../src/lib/content/app";
import type { Rpc } from "../../src/lib/content/rpc";
import type { PageInfo, Request } from "../../src/lib/messaging/messages";

const asked: Request[] = [];
const posted: unknown[] = [];
const info: PageInfo = {
  enabled: true,
  autoScan: false,
  scan: true,
  incognito: false,
  language: "en",
  strings: {},
  theme: "system",
  models: [],
  entries: [],
};
const rpc: Rpc = {
  request: (async (msg: Request) => {
    asked.push(msg);
    if (msg.type === "page-info") return info;
    if (msg.type === "source-status") return { status: "normal" };
    if (msg.type === "preview-plan") return { ok: true, model: "m", remote: false };
    return { ok: true };
  }) as Rpc["request"],
  connect: () => ({
    postMessage: (m) => void posted.push(m),
    disconnect: () => undefined,
    onMessage: { addListener: () => undefined },
    onDisconnect: { addListener: () => undefined },
  }),
};
const panel = () => [...document.documentElement.children].find((e) => e.shadowRoot)?.shadowRoot?.querySelector('[data-hb="preview"]');

beforeEach(() => {
  asked.length = 0;
  posted.length = 0;
  document.documentElement.innerHTML = "<head></head><body><canvas></canvas></body>";
});

describe("the toolbar button on a page whose text cannot be read", () => {
  it("says so in the Google Docs editor, and does not plan a scan", async () => {
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL("https://docs.google.com/document/d/abc123/edit");
    const app = new ContentApp(rpc, "open");
    await app.offerPreview();
    expect(panel()!.textContent).toContain("published or mobile view");
    expect(asked.some((m) => m.type === "preview-plan")).toBe(false);
  });

  it("still offers a scan where the text can be read", async () => {
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(
      "https://docs.google.com/document/d/abc123/mobilebasic",
    );
    const app = new ContentApp(rpc, "open");
    await app.offerPreview();
    await Promise.resolve();
    expect(asked.some((m) => m.type === "preview-plan")).toBe(true);
  });

  it("sends nothing when text is selected in the Google Docs editor, since it is the editor's menus and not the document", async () => {
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL("https://docs.google.com/document/d/abc123/edit");
    document.body.innerHTML = '<div id="menu">File Edit View</div><canvas></canvas>';
    const app = new ContentApp(rpc, "open");
    await app.start();
    const text = document.querySelector("#menu")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    app.explain(range, { mode: "explain" });
    expect(posted).toEqual([]);
  });
});
