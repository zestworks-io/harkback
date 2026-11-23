// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { ContentApp, type FormulaPick, type PageSource } from "../../src/lib/content/app";
import type { Rpc } from "../../src/lib/content/rpc";
import type { PageInfo, PortIn, Request } from "../../src/lib/messaging/messages";
import { detectSource } from "../../src/lib/source/source-id";

let status = "normal";
let incognito = false;
const posted: PortIn[] = [];

const info = (): PageInfo => ({
  enabled: true,
  autoScan: false,
  scan: true,
  underlines: null,
  incognito,
  language: "en",
  strings: {},
  theme: "system",
  models: [],
  entries: [],
});
const rpc: Rpc = {
  request: (async (msg: Request) => {
    if (msg.type === "source-status") return { status };
    return msg.type === "page-info" ? info() : { ok: true };
  }) as Rpc["request"],
  connect: () => ({
    postMessage: (m) => posted.push(m),
    disconnect: () => undefined,
    onMessage: { addListener: () => undefined },
    onDisconnect: { addListener: () => undefined },
  }),
};
const starts = () => posted.filter((m): m is Extract<PortIn, { type: "start" }> => m.type === "start");
const shadow = () => [...document.documentElement.children].find((e) => e.shadowRoot)?.shadowRoot ?? null;

function mathRange(): Range {
  const r = document.createRange();
  r.selectNodeContents(document.querySelector("#m")!);
  return r;
}

beforeEach(() => {
  posted.length = 0;
  status = "normal";
  incognito = false;
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL("https://arxiv.org/html/1706.03762");
  document.documentElement.innerHTML = `<head></head><body><article><p>The update is <math id="m" alttext="W_{0}+BA"><semantics><mrow><msub><mi>W</mi><mn>0</mn></msub><mo>+</mo><mi>B</mi><mi>A</mi></mrow></semantics></math> where the rank is small.</p></article></body>`;
});

describe("formulas and reunion cards", () => {
  it("compares with an earlier look-up as a term, even inside a formula", async () => {
    const app = new ContentApp(rpc, "open");
    await app.activate();
    app.explain(mathRange(), { mode: "compare", earlierEncounterId: "e1", conceptId: "c1", text: "W_{0}+BA" });
    expect(starts()[0]?.request).toMatchObject({ mode: "compare", earlierEncounterId: "e1" });
    expect(starts()[0]?.request.formula).toBeUndefined();
  });
});

describe("a formula looked up by the page source (the PDF reader)", () => {
  function reader(find: PageSource["formula"]): ContentApp {
    return new ContentApp(rpc, "open", {
      url: "https://arxiv.org/pdf/1706.03762",
      detect: () => detectSource("https://arxiv.org/abs/1706.03762", document),
      root: () => undefined,
      formula: find,
    });
  }

  it("shows the card at once while the lookup runs, and closing it drops the lookup", async () => {
    let resolve: (p: FormulaPick | null) => void = () => undefined;
    const app = reader(() => new Promise((r) => (resolve = r)));
    await app.activate();
    app.explain(mathRange(), { mode: "explain" });
    expect(shadow()?.querySelector('[data-hb="card"]')).not.toBeNull();
    shadow()!.querySelector<HTMLElement>('[data-hb="close"]')!.click();
    resolve({ request: { tex: "x", definitions: [] }, view: { tex: "x" }, quotesOnPage: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(starts()).toHaveLength(0);
  });

  it("lets the lookup ask arXiv only for a normal source in a normal window", async () => {
    const allowed: boolean[] = [];
    const app = reader(async (_range, _page, mayLookUp) => {
      allowed.push(await mayLookUp());
      return null;
    });
    await app.activate();
    app.explain(mathRange(), { mode: "explain" });
    status = "sensitive";
    await new Promise((r) => setTimeout(r, 0));
    app.explain(mathRange(), { mode: "reexplain" });
    await new Promise((r) => setTimeout(r, 0));
    expect(allowed).toEqual([true, false]);
  });
});
