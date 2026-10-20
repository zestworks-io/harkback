// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { zoteroView, type ZoteroProgress, type ZoteroViewDeps } from "../../src/lib/pages/zotero-view";
import { zoteroClient } from "../../src/lib/zotero/client";
import type { ZoteroTerm } from "../../src/lib/zotero/highlights";
import { fakeZotero, USER } from "./fake";

function setup(o: { key?: string; granted?: boolean; progress?: Record<number, ZoteroProgress>; status?: number[] } = {}) {
  const z = fakeZotero({ ...(o.status && { status: o.status }) });
  const stored: Record<number, ZoteroProgress> = { ...o.progress };
  const recorded: ZoteroTerm[][] = [];
  const deps: ZoteroViewDeps = {
    lang: () => "en",
    key: () => o.key ?? "secret",
    grant: vi.fn(async () => o.granted ?? true),
    client: (key) => zoteroClient({ key, fetch: z.fetch, sleep: z.sleep }),
    loadProgress: async (userID) => stored[userID] ?? null,
    saveProgress: async (userID, p) => void (stored[userID] = p),
    record: async (terms) => (recorded.push(terms), { ok: true, added: terms.length }),
  };
  const view = zoteroView(deps);
  document.body.replaceChildren(view.element);
  const $ = (hb: string) => view.element.querySelector<HTMLElement>(`[data-hb="${hb}"]`);
  // Done once the status says something other than that it is reading.
  const settle = () => vi.waitFor(() => expect(["", "Reading Zotero…"]).not.toContain($("zotero-status")!.textContent));
  return { deps, view, $, settle, recorded, progress: () => stored[USER] ?? null, stored, calls: z.calls };
}

describe("zoteroView", () => {
  it("lists the terms found, imports the ticked ones and remembers every one offered", async () => {
    const s = setup();
    s.$("zotero-find")!.click();
    await s.settle();
    expect(s.$("zotero-status")!.textContent).toBe("Terms found: 6. Longer highlights left out: 1.");
    const boxes = [...s.view.element.querySelectorAll<HTMLInputElement>('[data-hb="zotero-term"]')];
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(s.view.element.textContent).toContain("recorded as sensitive");
    boxes[0]!.click();

    s.$("zotero-import")!.click();
    await s.settle();
    expect(s.recorded[0]!.map((t) => t.term)).toEqual(["low-rank adaptation", "visual analytics", "Transformer", "置信区间", "LoRA"]);
    expect(s.$("zotero-status")!.textContent).toBe("Look-ups imported: 5.");
    expect(s.progress()).toEqual({
      version: 965,
      decided: ["ANNLORA1", "ANNUNDR1", "ANNVISA1", "ANNATTN1", "ANNLONE1", "ANNLORA2"],
    });
  });

  it("asks only for changes the next time, and offers nothing decided before", async () => {
    const s = setup({ progress: { [USER]: { version: 806, decided: ["ANNATTN1"] } } });
    s.$("zotero-find")!.click();
    await s.settle();
    expect(s.calls.find((c) => c.url.includes("itemType=annotation"))!.url).toContain("since=806");
    expect([...s.view.element.querySelectorAll('[data-hb="zotero-terms"] strong')].map((e) => e.textContent)).toEqual(["置信区间", "LoRA"]);
  });

  it("keeps each library's progress apart", async () => {
    const s = setup({ progress: { 1: { version: 900, decided: ["ANNLORA1"] } } });
    s.$("zotero-find")!.click();
    await s.settle();
    expect(s.calls.some((c) => c.url.includes("since="))).toBe(false);
    expect(s.$("zotero-status")!.textContent).toBe("Terms found: 6. Longer highlights left out: 1.");
    s.$("zotero-import")!.click();
    await s.settle();
    expect(s.stored[1]).toEqual({ version: 900, decided: ["ANNLORA1"] });
  });

  it("remembers the version when nothing is new, and not past a highlight whose paper is missing", async () => {
    const none = setup({ progress: { [USER]: { version: 806, decided: ["ANNATTN1", "ANNLONE1", "ANNLORA2"] } } });
    none.$("zotero-find")!.click();
    await none.settle();
    expect(none.$("zotero-status")!.textContent).toBe("No new terms in your highlights.");
    expect(none.progress()!.version).toBe(965);

    const missing = setup();
    const client = missing.deps.client;
    missing.deps.client = (key) => {
      const c = client(key);
      return { ...c, items: async (u, keys) => (await c.items(u, keys)).filter((i) => i.key !== "ATTALONE") };
    };
    missing.$("zotero-find")!.click();
    await missing.settle();
    missing.$("zotero-import")!.click();
    await missing.settle();
    expect(missing.progress()!.version).toBe(0);
  });

  it("says what went wrong, and asks nothing of Zotero without a key or access", async () => {
    const noKey = setup({ key: " " });
    noKey.$("zotero-find")!.click();
    await noKey.settle();
    expect(noKey.$("zotero-status")!.textContent).toBe("Paste your Zotero API key first.");
    expect(noKey.deps.grant).not.toHaveBeenCalled();

    const denied = setup({ granted: false });
    denied.$("zotero-find")!.click();
    await denied.settle();
    expect(denied.$("zotero-status")!.textContent).toBe("Access to Zotero was not granted.");
    expect(denied.calls).toEqual([]);

    const failing = setup();
    failing.deps.record = async () => {
      throw new Error("no answer");
    };
    failing.$("zotero-find")!.click();
    await failing.settle();
    failing.$("zotero-import")!.click();
    await failing.settle();
    expect(failing.$("zotero-status")!.textContent).toBe("Import failed.");
    expect(failing.progress()).toBeNull();

    const wrong = setup({ status: [403] });
    wrong.$("zotero-find")!.click();
    await wrong.settle();
    expect(wrong.$("zotero-status")!.textContent).toBe("The key is wrong or was revoked.");
  });
});
