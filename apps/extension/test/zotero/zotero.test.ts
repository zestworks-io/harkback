import { describe, expect, it } from "vitest";
import { replay } from "@harkback/core";
import { reviewQueue } from "../../src/lib/review/review";
import { readLibrary, zoteroClient, ZoteroError } from "../../src/lib/zotero/client";
import { buildImportEvents, findTerms, paperOf, termOfHighlight, type ZoteroItem } from "../../src/lib/zotero/highlights";
import { world } from "../helpers";

import { fakeZotero, fixture, USER } from "./fake";

describe("termOfHighlight", () => {
  it("keeps a term and drops a passage", () => {
    expect(termOfHighlight("LoRA")).toBe("LoRA");
    expect(termOfHighlight("  low-rank\nadaptation ")).toBe("low-rank adaptation");
    expect(termOfHighlight("“Transformer”,")).toBe("Transformer");
    expect(termOfHighlight("置信区间")).toBe("置信区间");
    expect(termOfHighlight("Node.js")).toBe("Node.js");
    expect(termOfHighlight("We propose Low-Rank Adaptation, or LoRA, which freezes the weights.")).toBeNull();
    expect(termOfHighlight("one two three four five six")).toBeNull();
    expect(termOfHighlight("Note: see below")).toBeNull();
    expect(termOfHighlight("我们提出了一种新的低秩适配方法来微调")).toBeNull();
    expect(termOfHighlight("模型，数据")).toBeNull();
    expect(termOfHighlight("3.14")).toBeNull();
    expect(termOfHighlight("softmax(x)")).toBe("softmax(x)");
    expect(termOfHighlight("(LoRA)")).toBe("LoRA");
    expect(termOfHighlight("(LoRA")).toBe("LoRA");
    expect(termOfHighlight("U.S.")).toBe("U.S.");
    expect(termOfHighlight("attention.")).toBe("attention");
    expect(termOfHighlight("[RLHF],")).toBe("RLHF");
    expect(termOfHighlight("")).toBeNull();
  });
});

describe("paperOf", () => {
  const items = new Map(fixture<ZoteroItem[]>("items.json").map((i) => [i.key, i]));
  const of = (paper: string | null, file: string) => paperOf(paper ? items.get(paper) : undefined, items.get(file)!, USER);

  it("names an arXiv paper by its arXiv id, also once it is published in a journal", () => {
    expect(of("PAPRLORA", "ATTALORA")).toEqual({
      sourceId: "arxiv:2106.09685",
      ids: { arxiv: "2106.09685", doi: "10.48550/arxiv.2106.09685" },
      title: "LoRA: Low-Rank Adaptation of Large Language Models",
      sensitive: false,
    });
    expect(of("PAPRATTN", "ATTAATTN")).toMatchObject({
      sourceId: "arxiv:1706.03762",
      ids: { arxiv: "1706.03762", doi: "10.5555/3295222.3295349" },
    });
  });

  it("finds the DOI inside a library proxy's address and keeps none of the address", () => {
    const p = of("PAPRVISA", "ATTAVISA");
    expect(p.sourceId).toBe("doi:10.1057/palgrave.ivs.9500167");
    expect(JSON.stringify(p)).not.toContain("cataleg");
  });

  it("finds an arXiv id written only in Extra, and a DOI written there", () => {
    const item = (data: Record<string, unknown>): ZoteroItem => ({ key: "K", data: { itemType: "report", ...data } });
    expect(paperOf(item({ extra: "arXiv:hep-th/9901001v2 [hep-th]" }), item({}), USER).sourceId).toBe("arxiv:hep-th/9901001");
    expect(paperOf(item({ extra: "tex.key: x\nDOI: 10.1000/ABC.1." }), item({}), USER).sourceId).toBe("doi:10.1000/abc.1");
  });

  it("names a file with no paper by its Zotero item, linked to its page, and calls it sensitive", () => {
    expect(of(null, "ATTALONE")).toEqual({
      sourceId: `zotero:${USER}/ATTALONE`,
      ids: { url: "https://www.zotero.org/reader/items/ATTALONE" },
      title: "lab notes.pdf",
      sensitive: true,
    });
  });
});

describe("zoteroClient", () => {
  it("checks the key, reads every page of highlights, and asks for files 50 at a time", async () => {
    const z = fakeZotero();
    const client = zoteroClient({ key: "secret", fetch: z.fetch, sleep: z.sleep });
    expect(await client.user()).toEqual({ userID: USER, username: "reader" });
    const lib = await readLibrary(client, USER, 0);
    expect(lib.annotations.map((a) => a.key)).toHaveLength(10);
    expect(lib.version).toBe(965);
    expect([...lib.items.keys()].sort()).toEqual(["ATTAATTN", "ATTALONE", "ATTALORA", "ATTAVISA", "PAPRATTN", "PAPRLORA", "PAPRVISA"]);
    expect(z.calls.every((c) => c.headers["Zotero-API-Version"] === "3" && c.headers["Zotero-API-Key"] === "secret")).toBe(true);
    expect(z.calls.some((c) => c.url.includes("key="))).toBe(false);

    const keys = Array.from({ length: 120 }, (_, i) => `K${i}`);
    await client.items(USER, keys);
    expect(z.calls.slice(-3).map((c) => new URL(c.url).searchParams.get("itemKey")!.split(",").length)).toEqual([50, 50, 20]);
  });

  it("asks only for what changed since the last import", async () => {
    const z = fakeZotero();
    const lib = await readLibrary(zoteroClient({ key: "k", fetch: z.fetch }), USER, 806);
    expect(lib.annotations.map((a) => a.key)).toEqual(["ANNATTN1", "ANNLONE1", "ANNLORA2", "ANNINK01"]);
    expect(z.calls[0]!.url).toContain("since=806");
  });

  it("tells a wrong key from a key that cannot read the library", async () => {
    await expect(zoteroClient({ key: "k", fetch: fakeZotero({ status: [403] }).fetch }).user()).rejects.toEqual(new ZoteroError("key"));
    await expect(zoteroClient({ key: "k", fetch: fakeZotero({ keys: "keys-current-no-library.json" }).fetch }).user()).rejects.toEqual(
      new ZoteroError("no-library"),
    );
  });

  it("waits as Zotero asks, and gives up when it keeps asking", async () => {
    const z = fakeZotero({ status: [429, 200], headers: [{ "Retry-After": "7" }, { Backoff: "3" }] });
    let clock = 0;
    const client = zoteroClient({
      key: "k",
      fetch: z.fetch,
      sleep: async (ms) => void (z.slept.push(ms), (clock += ms)),
      now: () => clock,
    });
    await client.user();
    await client.user();
    expect(z.slept).toEqual([7000, 3000]);
    const busy = fakeZotero({ status: [503, 503, 503] });
    await expect(zoteroClient({ key: "k", fetch: busy.fetch, sleep: busy.sleep }).user()).rejects.toEqual(new ZoteroError("busy"));
    const long = fakeZotero({ status: [429], headers: [{ "Retry-After": "3600" }] });
    await expect(zoteroClient({ key: "k", fetch: long.fetch, sleep: long.sleep }).user()).rejects.toEqual(new ZoteroError("busy"));
  });
});

describe("findTerms and buildImportEvents", () => {
  async function library() {
    const z = fakeZotero();
    return readLibrary(zoteroClient({ key: "k", fetch: z.fetch }), USER, 0);
  }

  it("keeps the terms, counts the passages, and skips notes, images, ink and what was decided before", async () => {
    const lib = await library();
    const found = findTerms(lib.annotations, lib.items, new Set(["ANNLORA2"]), USER);
    expect(found.terms.map((t) => [t.annotationKey, t.term, t.paper.sourceId])).toEqual([
      ["ANNLORA1", "LoRA", "arxiv:2106.09685"],
      ["ANNUNDR1", "low-rank adaptation", "arxiv:2106.09685"],
      ["ANNVISA1", "visual analytics", "doi:10.1057/palgrave.ivs.9500167"],
      ["ANNATTN1", "Transformer", "arxiv:1706.03762"],
      ["ANNLONE1", "置信区间", `zotero:${USER}/ATTALONE`],
    ]);
    expect(found.passages).toBe(1);
    expect(found.orphans).toBe(0);
  });

  it("counts a highlight whose file is gone", async () => {
    const lib = await library();
    lib.items.delete("ATTAVISA");
    expect(findTerms(lib.annotations, lib.items, new Set(), USER).orphans).toBe(2);
  });

  it("records one concept per term, joins a concept already named so, and leaves a known source as it is", async () => {
    const w = world();
    w.source("arxiv:2106.09685", "sensitive", "LoRA (seen on arXiv)");
    const known = w.concept("Transformer");
    w.encounter(known, "arxiv:2106.09685");
    const state = replay(w.events);
    const lib = await library();
    const found = findTerms(lib.annotations, lib.items, new Set(), USER);
    const events = buildImportEvents(w.f, state, found.terms);
    const after = replay([...w.events, ...events]);
    expect(events.filter((e) => e.type === "concept.created").map((e) => e.payload.canonical_name)).toEqual([
      "LoRA",
      "low-rank adaptation",
      "visual analytics",
      "置信区间",
    ]);
    // Two highlights of LoRA, in two papers: one concept, two look-ups.
    const lora = [...after.concepts.values()].find((c) => c.canonicalName === "LoRA")!;
    expect(after.encountersByConcept.get(lora.id)).toHaveLength(2);
    expect(after.encountersByConcept.get(after.representative.get(known)!)).toHaveLength(2);
    expect(after.sources.get("arxiv:2106.09685")).toMatchObject({ sensitivity: "sensitive", title: "LoRA (seen on arXiv)" });
    expect(after.sources.get(`zotero:${USER}/ATTALONE`)?.sensitivity).toBe("sensitive");
    expect(after.sources.get("doi:10.1057/palgrave.ivs.9500167")?.sensitivity).toBe("normal");
    const imported = [...after.encounters.values()].filter((e) => e.explanation.model === "zotero");
    expect(imported.every((e) => e.explanation.text === "" && e.selection === e.locator.exact)).toBe(true);
  });

  it("does not record a highlight twice, even when it is imported again", async () => {
    const w = world();
    const lib = await library();
    const terms = findTerms(lib.annotations, lib.items, new Set(), USER).terms;
    w.events.push(...buildImportEvents(w.f, replay([]), [...terms, ...terms]));
    expect(w.events.filter((e) => e.type === "encounter.created")).toHaveLength(6);
    expect(buildImportEvents(w.f, replay(w.events), terms)).toEqual([]);
  });

  it("leaves a term only highlighted out of review, and reviews it once it is explained", async () => {
    const w = world();
    const lib = await library();
    const found = findTerms(lib.annotations, lib.items, new Set(), USER);
    w.events.push(...buildImportEvents(w.f, replay([]), found.terms));
    const later = Date.UTC(2026, 9, 1);
    expect(reviewQueue(replay(w.events), later)).toEqual([]);
    const lora = [...replay(w.events).concepts.values()].find((c) => c.canonicalName === "LoRA")!;
    w.encounter(lora.id, "arxiv:2106.09685", "A way to fine-tune with small low-rank matrices.");
    expect(reviewQueue(replay(w.events), later).map((i) => [i.name, i.explanation])).toEqual([
      ["LoRA", "A way to fine-tune with small low-rank matrices."],
    ]);
  });
});

describe("exports of terms only highlighted", () => {
  it("make no flashcard and say the term was not explained", async () => {
    const { ankiTsv } = await import("../../src/lib/export/anki");
    const { exportMarkdown } = await import("@harkback/core");
    const w = world();
    const lib = await readLibrary(zoteroClient({ key: "k", fetch: fakeZotero().fetch }), USER, 0);
    w.events.push(...buildImportEvents(w.f, replay([]), findTerms(lib.annotations, lib.items, new Set(), USER).terms));
    const state = replay(w.events);
    expect(ankiTsv(state).trim().split("\n")).toHaveLength(3);
    const md = exportMarkdown(state, "en");
    expect(md).toContain("  > Highlighted in Zotero; not explained yet.");
    expect(md).not.toContain("External knowledge");
  });
});
