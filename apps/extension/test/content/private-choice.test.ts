// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { ContentApp } from "../../src/lib/content/app";
import type { Rpc } from "../../src/lib/content/rpc";
import type { PageInfo, PortIn, PortOut, Request } from "../../src/lib/messaging/messages";

const URL_ = "https://github.com/acme/secret";
const asked: Request[] = [];
const posted: PortIn[] = [];
let incoming: ((m: PortOut) => void) | null = null;
let incognito = false;
let status = "normal";
let byRule = false;
let failStatus = false;

const info = (): PageInfo => ({
  enabled: true,
  autoScan: false,
  scan: true,
  incognito,
  language: "en",
  strings: {},
  theme: "system",
  models: [],
  entries: [],
});

const rpc: Rpc = {
  request: (async (msg: Request) => {
    asked.push(msg);
    if (msg.type === "source-status") {
      if (failStatus) throw new Error("asleep");
      return { status, ...(byRule ? { byRule } : {}) };
    }
    return msg.type === "page-info" ? info() : { ok: true };
  }) as Rpc["request"],
  connect: () => ({
    postMessage: (m) => posted.push(m),
    disconnect: () => undefined,
    onMessage: { addListener: (l) => void (incoming = l) },
    onDisconnect: { addListener: () => undefined },
  }),
};

const starts = () => posted.filter((m): m is Extract<PortIn, { type: "start" }> => m.type === "start");
const card = () => [...document.documentElement.children].find((e) => e.shadowRoot)!.shadowRoot!;
const click = (hb: string) => card().querySelector<HTMLElement>(`[data-hb="${hb}"]`)!.click();

function selectTerm(app: ContentApp): void {
  const text = document.querySelector("article p")!.firstChild!;
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 16);
  app.explain(range, { mode: "explain" });
}

beforeEach(async () => {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(URL_);
  document.documentElement.innerHTML = `<head><meta name="octolytics-dimension-repository_public" content="false"></head>
    <body><nav>Navigation</nav><article class="markdown-body"><p>Gradient descent minimises a loss.</p></article></body>`;
  asked.length = 0;
  posted.length = 0;
  incoming = null;
  incognito = false;
  status = "normal";
  byRule = false;
  failStatus = false;
});

describe("ContentApp on a page that looks private", () => {
  it("sends what the page suggests with the request, and no choice yet", async () => {
    const app = new ContentApp(rpc, "open");
    await app.start();
    selectTerm(app);
    expect(starts()).toHaveLength(1);
    expect(starts()[0]!.request).toMatchObject({ privacy: "likely-private" });
    expect(starts()[0]!.request).not.toHaveProperty("choice");
  });

  it("asks when the background will not send, then marks the source sensitive and asks again as local only", async () => {
    const app = new ContentApp(rpc, "open");
    await app.start();
    selectTerm(app);
    incoming!({ type: "error", code: "needs_choice" });
    expect(card().querySelector('[data-hb="choice"]')).not.toBeNull();
    expect(card().querySelector('[data-hb="error"]')).toBeNull();
    click("choose-local");
    expect(asked.find((m) => m.type === "mark-sensitive")).toMatchObject({ source: { source_id: "github:acme/secret" } });
    expect(starts()).toHaveLength(2);
    expect(starts()[1]!.request).toMatchObject({ choice: "local", privacy: "likely-private" });
  });

  it("records the choice to send, and remembers the site when asked", async () => {
    const app = new ContentApp(rpc, "open");
    await app.start();
    selectTerm(app);
    incoming!({ type: "error", code: "needs_choice" });
    (card().querySelector('[data-hb="choose-remember"]') as HTMLInputElement).click();
    click("choose-anyway");
    expect(asked.find((m) => m.type === "choose-normal")).toMatchObject({ source: { source_id: "github:acme/secret" } });
    expect(asked.find((m) => m.type === "remember-site")).toEqual({ type: "remember-site", sensitive: false });
    expect(starts()[1]!.request).toMatchObject({ choice: "anyway" });
  });

  it("keeps the answer for the rest of the visit, so a second selection is not asked about", async () => {
    const app = new ContentApp(rpc, "open");
    await app.start();
    selectTerm(app);
    incoming!({ type: "error", code: "needs_choice" });
    click("choose-local");
    posted.length = 0;
    const text = document.querySelector("article p")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 17);
    range.setEnd(text, 23);
    app.explain(range, { mode: "explain" });
    expect(starts()[0]!.request).toMatchObject({ choice: "local" });
  });

  it("writes nothing in a private window, but still uses the answer for this visit", async () => {
    incognito = true;
    const app = new ContentApp(rpc, "open");
    await app.start();
    selectTerm(app);
    incoming!({ type: "error", code: "needs_choice" });
    (card().querySelector('[data-hb="choose-remember"]') as HTMLInputElement).click();
    click("choose-local");
    expect(asked.filter((m) => m.type === "mark-sensitive" || m.type === "choose-normal" || m.type === "remember-site")).toEqual([]);
    expect(starts()[1]!.request).toMatchObject({ choice: "local" });
  });
});

describe("the lock on a page", () => {
  const chip = () => card().querySelector<HTMLElement>('[data-hb="lock-chip"]');

  it("is not shown for a page that is fine", async () => {
    const app = new ContentApp(rpc, "open");
    await app.start();
    expect(asked.some((m) => m.type === "source-status")).toBe(true);
    expect(document.documentElement.children.length).toBeGreaterThan(0);
    const host = [...document.documentElement.children].find((e) => e.shadowRoot);
    expect(host?.shadowRoot?.querySelector('[data-hb="lock-chip"]')).toBeFalsy();
  });

  it("shows a sensitive page and lets the reader unmark it", async () => {
    status = "sensitive";
    const app = new ContentApp(rpc, "open");
    await app.start();
    await Promise.resolve();
    expect(chip()!.hidden).toBe(false);
    status = "normal";
    click("lock");
    await Promise.resolve();
    expect(asked.find((m) => m.type === "mark-normal")).toMatchObject({
      sourceId: "github:acme/secret",
      source: { source_id: "github:acme/secret" },
    });
  });

  it("asks about a page that looks private before anything is selected, then looks again", async () => {
    status = "ask";
    const app = new ContentApp(rpc, "open");
    await app.start();
    await Promise.resolve();
    click("lock");
    status = "sensitive";
    click("choose-local");
    await new Promise((r) => setTimeout(r, 0));
    expect(asked.find((m) => m.type === "mark-sensitive")).toMatchObject({ source: { source_id: "github:acme/secret" } });
    expect(asked.filter((m) => m.type === "source-status").length).toBeGreaterThanOrEqual(2);
    expect(chip()!.textContent).toContain("Sensitive");
  });
});

describe("the lock after the reader's own answers", () => {
  const chip = () => card().querySelector<HTMLElement>('[data-hb="lock-chip"]');

  it("lets go of a local-only answer when the page is unmarked, so later explanations are not forced local", async () => {
    const app = new ContentApp(rpc, "open");
    await app.start();
    selectTerm(app);
    incoming!({ type: "error", code: "needs_choice" });
    click("choose-local");
    expect(starts()[1]!.request).toMatchObject({ choice: "local" });
    status = "sensitive";
    await new Promise((r) => setTimeout(r, 0));
    click("lock");
    await new Promise((r) => setTimeout(r, 0));
    posted.length = 0;
    const text = document.querySelector("article p")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 17);
    range.setEnd(text, 23);
    app.explain(range, { mode: "explain" });
    expect(starts()[0]!.request).not.toHaveProperty("choice");
  });

  it("shows a site rule's sensitivity without a button that does nothing", async () => {
    status = "sensitive";
    byRule = true;
    const app = new ContentApp(rpc, "open");
    await app.start();
    await Promise.resolve();
    expect(card().querySelector<HTMLButtonElement>('[data-hb="lock"]')!.disabled).toBe(true);
  });

  it("drops the lock of the page before when it cannot tell about this one", async () => {
    status = "sensitive";
    const app = new ContentApp(rpc, "open");
    await app.start();
    await Promise.resolve();
    expect(chip()!.hidden).toBe(false);
    failStatus = true;
    await app.activate();
    await new Promise((r) => setTimeout(r, 0));
    expect(chip()!.hidden).toBe(true);
  });

  it("does not leave an unhandled failure when the background is asleep", async () => {
    status = "sensitive";
    const app = new ContentApp(rpc, "open");
    await app.start();
    await Promise.resolve();
    const unhandled: unknown[] = [];
    const on = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", on);
    failStatus = true;
    click("lock");
    await new Promise((r) => setTimeout(r, 20));
    process.off("unhandledRejection", on);
    expect(unhandled).toEqual([]);
  });
});
