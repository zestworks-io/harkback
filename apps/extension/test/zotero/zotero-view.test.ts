// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { storedProgress, zoteroView, type ZoteroProgress, type ZoteroViewDeps } from "../../src/lib/pages/zotero-view";
import { zoteroClient, ZoteroError } from "../../src/lib/zotero/client";
import type { ZoteroItem, ZoteroTerm } from "../../src/lib/zotero/highlights";
import { fakeZotero, GROUP, USER } from "./fake";

function setup(
  o: { key?: string; granted?: boolean; progress?: Record<string, ZoteroProgress>; status?: number[]; groupMember?: string } = {},
) {
  const z = fakeZotero({ ...(o.status && { status: o.status }) });
  // The group's highlights as made by another of its members.
  if (o.groupMember) {
    const served = z.fetch;
    z.fetch = async (input, init) => {
      const res = await served(input, init);
      if (!String(input).includes(`/groups/${GROUP}/items?itemType=annotation`)) return res;
      const items = (await res.json()) as ZoteroItem[];
      for (const a of items) a.meta = { createdByUser: { id: USER + 1, username: o.groupMember } };
      return new Response(JSON.stringify(items), { status: res.status, headers: res.headers });
    };
  }
  const stored: Record<string, ZoteroProgress> = { ...o.progress };
  const recorded: ZoteroTerm[][] = [];
  const deps: ZoteroViewDeps = {
    lang: () => "en",
    key: () => o.key ?? "secret",
    grant: vi.fn(async () => o.granted ?? true),
    client: (key) => zoteroClient({ key, fetch: z.fetch, sleep: z.sleep }),
    loadProgress: async (path) => stored[path] ?? null,
    saveProgress: async (path, p) => void (stored[path] = p),
    record: async (terms) => (recorded.push(terms), { ok: true, added: terms.length }),
  };
  const view = zoteroView(deps);
  document.body.replaceChildren(view.element);
  const $ = (hb: string) => view.element.querySelector<HTMLElement>(`[data-hb="${hb}"]`);
  // Done once the status says something other than that it is reading.
  const settle = () => vi.waitFor(() => expect(["", "Reading Zotero…"]).not.toContain($("zotero-status")!.textContent));
  return { deps, view, $, settle, recorded, progress: () => stored[`users/${USER}`] ?? null, stored, calls: z.calls };
}

describe("zoteroView", () => {
  it("lists the terms found, imports the ticked ones and remembers every one offered", async () => {
    const s = setup();
    s.$("zotero-find")!.click();
    await s.settle();
    expect(s.$("zotero-status")!.textContent).toBe("Terms found: 7. Longer highlights left out: 1.");
    const boxes = [...s.view.element.querySelectorAll<HTMLInputElement>('[data-hb="zotero-term"]')];
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(s.view.element.textContent).toContain("recorded as sensitive");
    boxes[0]!.click();

    s.$("zotero-import")!.click();
    await s.settle();
    expect(s.recorded[0]!.map((t) => t.term)).toEqual([
      "low-rank adaptation",
      "visual analytics",
      "Transformer",
      "置信区间",
      "LoRA",
      "RLHF",
    ]);
    expect(s.recorded[0]!.at(-1)!.group).toBe("Reading group");
    expect(s.$("zotero-status")!.textContent).toBe("Look-ups imported: 6.");
    expect(s.progress()).toEqual({
      version: 965,
      decided: ["ANNLORA1", "ANNUNDR1", "ANNVISA1", "ANNATTN1", "ANNLONE1", "ANNLORA2"],
    });
    // Each group keeps its own progress; one with no highlights still remembers its version.
    expect(s.stored[`groups/${GROUP}`]).toEqual({ version: 41, decided: ["GANNRLHF"] });
    expect(s.stored["groups/777002"]).toEqual({ version: 3, decided: [] });
  });

  it("offers another member's highlights in a group unticked, and says whose they are", async () => {
    const s = setup({ groupMember: "colleague" });
    s.$("zotero-find")!.click();
    await s.settle();
    const rows = [...s.view.element.querySelectorAll('[data-hb="zotero-terms"] li')];
    const rlhf = rows.find((r) => r.querySelector("strong")!.textContent === "RLHF")!;
    expect(rlhf.querySelector<HTMLInputElement>('[data-hb="zotero-term"]')!.checked).toBe(false);
    expect(rlhf.querySelector('[data-hb="zotero-highlighted-by"]')!.textContent).toBe(" · highlighted by colleague");
    expect(rows.filter((r) => r.querySelector<HTMLInputElement>("input")!.checked)).toHaveLength(6);
    // Still importable when ticked.
    rlhf.querySelector<HTMLInputElement>("input")!.click();
    s.$("zotero-import")!.click();
    await s.settle();
    expect(s.recorded[0]!.at(-1)).toMatchObject({ term: "RLHF", highlightedBy: "colleague" });
  });

  it("asks only for changes the next time, and offers nothing decided before", async () => {
    const s = setup({ progress: { [`users/${USER}`]: { version: 806, decided: ["ANNATTN1"] } } });
    s.$("zotero-find")!.click();
    await s.settle();
    expect(s.calls.find((c) => c.url.includes("itemType=annotation"))!.url).toContain("since=806");
    expect([...s.view.element.querySelectorAll('[data-hb="zotero-terms"] strong')].map((e) => e.textContent)).toEqual([
      "置信区间",
      "LoRA",
      "RLHF",
    ]);
  });

  it("keeps each library's progress apart", async () => {
    const s = setup({ progress: { 1: { version: 900, decided: ["ANNLORA1"] } } });
    s.$("zotero-find")!.click();
    await s.settle();
    expect(s.calls.some((c) => c.url.includes("since="))).toBe(false);
    expect(s.$("zotero-status")!.textContent).toBe("Terms found: 7. Longer highlights left out: 1.");
    s.$("zotero-import")!.click();
    await s.settle();
    expect(s.stored[1]).toEqual({ version: 900, decided: ["ANNLORA1"] });
  });

  it("remembers the version when nothing is new, and not past a highlight whose paper is missing", async () => {
    const none = setup({
      progress: {
        [`users/${USER}`]: { version: 806, decided: ["ANNATTN1", "ANNLONE1", "ANNLORA2"] },
        [`groups/${GROUP}`]: { version: 41, decided: [] },
      },
    });
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

describe("zoteroView with a group that cannot be read", () => {
  it("still offers what the other libraries hold", async () => {
    const s = setup();
    const client = s.deps.client;
    s.deps.client = (key) => {
      const c = client(key);
      return {
        ...c,
        annotations: async (lib, since) => {
          if (lib.type === "group" && lib.id === GROUP) throw new ZoteroError("server");
          return c.annotations(lib, since);
        },
      };
    };
    s.$("zotero-find")!.click();
    await s.settle();
    expect(s.$("zotero-status")!.textContent).toBe("Terms found: 6. Longer highlights left out: 1.");
    expect(s.stored[`groups/${GROUP}`]).toBeUndefined();
  });
});

describe("storedProgress", () => {
  it("finds a library's progress by its path, and the reader's own under the id 1.0.5 used", () => {
    const p = { version: 5, decided: ["A"] };
    expect(storedProgress({ "users/1": p }, "users/1")).toBe(p);
    expect(storedProgress({ "1": p }, "users/1")).toBe(p);
    expect(storedProgress({ "1": p }, "groups/1")).toBeNull();
    expect(storedProgress(undefined, "users/1")).toBeNull();
  });
});
