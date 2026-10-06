// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAsDataUrl, looksLikePdfUrl, openReader, readerUrl, type OpenDeps } from "../src/lib/pdf/open";

const PAGE = "chrome-extension://abc/reader.html";

function deps(over: Partial<OpenDeps> = {}): OpenDeps & { navigated: string[] } {
  const navigated: string[] = [];
  return {
    readerPage: PAGE,
    isPdf: async () => false,
    download: async () => "data:application/pdf;base64,QUJD",
    stash: async () => "id1",
    navigate: async (_id, url) => {
      navigated.push(url);
    },
    ...over,
    navigated,
  };
}

describe("looksLikePdfUrl", () => {
  it("looks at the path only", () => {
    expect(looksLikePdfUrl("https://a.com/x/Paper.PDF")).toBe(true);
    expect(looksLikePdfUrl("https://a.com/x.pdf?dl=1#page=2")).toBe(true);
    expect(looksLikePdfUrl("https://a.com/pdf/123")).toBe(false);
    expect(looksLikePdfUrl("https://a.com/?f=x.pdf")).toBe(false);
    expect(looksLikePdfUrl("not a url")).toBe(false);
  });
});

describe("readerUrl", () => {
  it("carries the address and the handoff id", () => {
    const u = new URL(readerUrl(PAGE, "https://a.com/p.pdf?x=1&y=2#page=3", "id 1"));
    expect(`${u.protocol}//${u.host}${u.pathname}`).toBe(PAGE);
    expect(u.searchParams.get("src")).toBe("https://a.com/p.pdf?x=1&y=2#page=3");
    expect(u.searchParams.get("h")).toBe("id 1");
    expect(new URL(readerUrl(PAGE, "file:///a.pdf")).searchParams.has("h")).toBe(false);
  });
});

describe("openReader", () => {
  it("opens a PDF address in the reader together with the downloaded file", async () => {
    const d = deps();
    expect(await openReader({ id: 7, url: "https://a.com/p.pdf" }, d)).toBe(true);
    expect(d.navigated).toEqual([readerUrl(PAGE, "https://a.com/p.pdf", "id1")]);
  });

  it("recognises a PDF whose address does not say so", async () => {
    const d = deps({ isPdf: async () => true });
    expect(await openReader({ id: 7, url: "https://a.com/download?id=5" }, d)).toBe(true);
    expect(d.navigated).toHaveLength(1);
  });

  it("leaves other pages alone", async () => {
    const d = deps({ isPdf: async () => false });
    expect(await openReader({ id: 7, url: "https://a.com/article" }, d)).toBe(false);
    expect(await openReader({ id: 7, url: "chrome-extension://abc/reader.html?src=x" }, d)).toBe(false);
    expect(await openReader({ id: 7, url: "chrome://settings/" }, d)).toBe(false);
    expect(await openReader({ url: "https://a.com/p.pdf" }, d)).toBe(false);
    expect(await openReader({ id: 7 }, d)).toBe(false);
    expect(d.navigated).toEqual([]);
  });

  it("lets the reader read a local file itself", async () => {
    const download = vi.fn(async () => "x");
    const d = deps({ download });
    expect(await openReader({ id: 7, url: "file:///Users/me/p.pdf" }, d)).toBe(true);
    expect(download).not.toHaveBeenCalled();
    expect(d.navigated).toEqual([readerUrl(PAGE, "file:///Users/me/p.pdf")]);
  });

  it("still opens the reader when the download did not work", async () => {
    for (const download of [async () => null, async () => Promise.reject(new Error("no access"))]) {
      const d = deps({ download });
      expect(await openReader({ id: 7, url: "https://a.com/p.pdf" }, d)).toBe(true);
      expect(d.navigated).toEqual([readerUrl(PAGE, "https://a.com/p.pdf")]);
    }
  });

  it("does not treat a failed page check as a PDF", async () => {
    const d = deps({ isPdf: async () => Promise.reject(new Error("no access")) });
    expect(await openReader({ id: 7, url: "https://a.com/x" }, d)).toBe(false);
  });
});

describe("fetchAsDataUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the current address and returns the file as a data URL", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Blob(["ABC"], { type: "application/pdf" })));
    expect(await fetchAsDataUrl()).toBe("data:application/pdf;base64,QUJD");
  });

  it("leaves a very large file for the reader to download itself", async () => {
    const big = new Response("x", { headers: { "content-length": String(65 * 1024 * 1024) } });
    vi.stubGlobal("fetch", async () => big);
    expect(await fetchAsDataUrl()).toBeNull();
  });

  it("answers null when the download fails", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 403 }));
    expect(await fetchAsDataUrl()).toBeNull();
    vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("blocked")));
    expect(await fetchAsDataUrl()).toBeNull();
  });
});
