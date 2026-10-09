import { eventsOf, expect, openArxiv, seedSettings, selectAndExplain, stubSettings, test } from "./harness";

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&t=5s";

/** The reader has looked up LoRA in a paper, so it is a term to meet again. */
async function knowLora(context: Parameters<typeof openArxiv>[0]): Promise<void> {
  const paper = await openArxiv(context, "2106.09685");
  await selectAndExplain(paper, "#t-lora");
  await expect(paper.locator("[data-hb=understood]")).toBeEnabled();
  await paper.close();
}

test("underlines a known term in the captions and records a lookup with its playback position", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { sites: [{ pattern: "youtube.com", autoScan: true }] }));
  await knowLora(context);

  // The content script is registered by the settings change; give it a moment on the first visit.
  const video = await context.newPage();
  await expect(async () => {
    await video.goto(WATCH);
    await expect(video.locator("[data-hb=mark]")).toHaveCount(1, { timeout: 4000 });
  }).toPass({ timeout: 25_000 });

  // The caption moves on: the underline goes with it, and comes back with the term.
  await video.evaluate(() => (window as unknown as { setCaptions(l: string[][]): void }).setCaptions([["nothing to see here", "", ""]]));
  await expect(video.locator("[data-hb=mark]")).toHaveCount(0);
  await video.evaluate(() => (window as unknown as { setCaptions(l: string[][]): void }).setCaptions([["and ", "LoRA", " again"]]));
  await expect(video.locator("[data-hb=mark]")).toHaveCount(1);

  // Pause, select the term and explain it.
  await video.evaluate(() => document.querySelector("video")!.dispatchEvent(new Event("pause")));
  const before = (await eventsOf(sw, "encounter.created")).length;
  await selectAndExplain(video, ".term");
  await expect(video.locator("[data-hb=understood]")).toBeEnabled();

  const created = await eventsOf(sw, "encounter.created");
  expect(created).toHaveLength(before + 1);
  const last = created.at(-1)!.payload as { source_id: string; locator: { exact: string; t?: number; prefix: string } };
  expect(last.source_id).toBe("youtube:dQw4w9WgXcQ");
  expect(last.locator).toMatchObject({ exact: "LoRA", t: 83 });

  const sources = await eventsOf(sw, "source.seen");
  const seen = sources
    .map((e) => e.payload as { source_id: string; ids: { url?: string }; title: string })
    .find((p) => p.source_id === "youtube:dQw4w9WgXcQ");
  expect(seen).toMatchObject({ ids: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, title: "Low-Rank Adaptation, explained" });
});

test("does nothing on YouTube until the site is added", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await knowLora(context);

  const video = await context.newPage();
  await video.goto(WATCH);
  await video.waitForTimeout(2000);
  await expect(video.locator("[data-hb=mark]")).toHaveCount(0);
});

test("does not read a YouTube page that is not a watch page", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { sites: [{ pattern: "youtube.com", autoScan: true }] }));
  await knowLora(context);

  const home = await context.newPage();
  await expect(async () => {
    await home.goto("https://www.youtube.com/results?search_query=lora");
    await home.waitForTimeout(1500);
    await expect(home.locator("[data-hb=mark]")).toHaveCount(0);
  }).toPass({ timeout: 10_000 });
});
