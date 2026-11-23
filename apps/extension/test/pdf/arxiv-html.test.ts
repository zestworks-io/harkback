// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createArxivHtml } from "../../src/lib/pdf/arxiv-html";

const html = readFileSync("apps/extension/fixtures/arxiv-1706.03762.html", "utf8");
const ok = () => vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }));

describe("arxivHtmlFor", () => {
  it("fetches the HTML version once per paper and reads its formulas", async () => {
    const fetch = ok();
    const lookup = createArxivHtml({ fetch, siteOff: async () => false });
    const first = await lookup("1706.03762");
    await lookup("1706.03762");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://arxiv.org/html/1706.03762", expect.objectContaining({ credentials: "omit" }));
    expect(first.kind === "ok" && first.html.equations.some((e) => e.number === "1")).toBe(true);
  });

  it("has nothing when arXiv has no HTML version or cannot be reached", async () => {
    const missing = createArxivHtml({ fetch: vi.fn(async () => new Response("not found", { status: 404 })), siteOff: async () => false });
    expect(await missing("2401.99999")).toEqual({ kind: "none" });
    const down = createArxivHtml({ fetch: vi.fn(async () => Promise.reject(new TypeError("offline"))), siteOff: async () => false });
    expect(await down("1706.03762")).toEqual({ kind: "none" });
  });

  it("does not ask arXiv when the reader turned arxiv.org off", async () => {
    const fetch = ok();
    expect(await createArxivHtml({ fetch, siteOff: async () => true })("1706.03762")).toEqual({ kind: "none" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks for a versioned id as given", async () => {
    const fetch = ok();
    await createArxivHtml({ fetch, siteOff: async () => false })("1706.03762v7");
    expect(fetch).toHaveBeenCalledWith("https://arxiv.org/html/1706.03762v7", expect.anything());
  });
});

describe("arxivHtmlFor after a failure", () => {
  it("asks again after a network failure, but remembers that a paper has no HTML version", async () => {
    let calls = 0;
    const flaky = createArxivHtml({
      fetch: vi.fn(async () => {
        calls++;
        if (calls === 1) throw new TypeError("offline");
        return new Response(html, { status: 200 });
      }),
      siteOff: async () => false,
    });
    expect(await flaky("1706.03762")).toEqual({ kind: "none" });
    expect((await flaky("1706.03762")).kind).toBe("ok");
    const fetch404 = vi.fn(async () => new Response("no", { status: 404 }));
    const missing = createArxivHtml({ fetch: fetch404, siteOff: async () => false });
    await missing("2401.99999");
    await missing("2401.99999");
    expect(fetch404).toHaveBeenCalledTimes(1);
  });

  it("asks once the reader turns arxiv.org back on", async () => {
    let off = true;
    const lookup = createArxivHtml({ fetch: vi.fn(async () => new Response(html, { status: 200 })), siteOff: async () => off });
    expect(await lookup("1706.03762")).toEqual({ kind: "none" });
    off = false;
    expect((await lookup("1706.03762")).kind).toBe("ok");
  });
});
