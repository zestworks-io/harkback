import type { Worker } from "@playwright/test";
import { expect, eventsOf, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test, type ChromeApi } from "./harness";

async function backupState(sw: Worker): Promise<{ lastAt: number | null; downloadIds: number[] } | undefined> {
  return sw.evaluate(
    async () => (await (globalThis as unknown as { chrome: ChromeApi }).chrome.storage.local.get("backupState")).backupState,
  ) as Promise<{ lastAt: number | null; downloadIds: number[] } | undefined>;
}

test("a follow-up is answered and recorded on the encounter", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=understood]")).toBeEnabled();
  stub.queue.push({ body: "和全量微调相比，它只训练很少的参数。" });
  await card.locator("[data-hb=followup-open]").click();
  await card.locator("[data-hb=followup-input]").fill("和全量微调比呢？");
  await card.locator("[data-hb=followup-send]").click();
  await expect(card.locator("[data-hb=followup-answer]")).toHaveText("和全量微调相比，它只训练很少的参数。");
  await expect
    .poll(async () => (await eventsOf(sw, "encounter.action")).find((e) => e.payload?.action === "followed_up")?.payload?.detail)
    .toMatchObject({ question: "和全量微调比呢？", answer: "和全量微调相比，它只训练很少的参数。" });
});

test("retrying after a model error records one explanation", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push({ status: 500 });
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await page.locator("[data-hb=retry]").click();
  await expect(page.locator("[data-hb=explanation]")).toHaveText("LoRA 是一个测试解释。");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  expect(stub.requests).toHaveLength(2);
  expect(await eventsOf(sw, "encounter.created")).toHaveLength(1);
});

test("stops calling the model when the local rate limit is reached", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { rateLimit: { perMinute: 1, perHour: 1000 } }));
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  await selectAndExplain(page, "#t-matrix");
  await expect(page.locator("[data-hb=error]")).toContainText("解释太频繁了");
  expect(stub.requests).toHaveLength(1);
});

test("marking a source sensitive keeps later follow-ups off non-local models", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=understood]")).toBeEnabled();
  await card.locator("[data-hb=mark-sensitive]").click();
  await expect.poll(async () => (await eventsOf(sw, "source.seen")).some((e) => e.payload?.sensitivity === "sensitive")).toBe(true);

  // No local model any more: the follow-up must not reach the stub.
  await seedSettings(sw, stubSettings(stub.url, { localModelId: null }));
  await card.locator("[data-hb=followup-open]").click();
  await card.locator("[data-hb=followup-input]").fill("再说说？");
  await card.locator("[data-hb=followup-send]").click();
  await expect(card.locator("[data-hb=followup-answer]")).toContainText("只能使用本机模型");
  expect(stub.requests).toHaveLength(1);
});

test("closing the card without answering 'same concept?' records a new concept", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();

  const second = await openArxiv(context, "2305.14314");
  await selectAndExplain(second, "#t-loras");
  await expect(second.locator("[data-hb=ask]")).toBeVisible();
  await second.locator("[data-hb=close]").click();
  await expect.poll(async () => (await eventsOf(sw, "encounter.created")).length).toBe(2);
  const [a, b] = await eventsOf(sw, "encounter.created");
  expect(b!.payload?.concept_id).not.toBe(a!.payload?.concept_id);
});

test("the daily alarm writes a due backup and keeps only the newest files", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { backup: { enabled: true } }));
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  await sw.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: ChromeApi }).chrome;
    await chrome.storage.local.set({ backupState: { lastAt: 1, downloadIds: [9001, 9002, 9003, 9004] } });
    await chrome.alarms.create("backup", { when: Date.now() + 200 });
  });
  await expect.poll(async () => (await backupState(sw))?.lastAt ?? 0, { timeout: 20_000 }).toBeGreaterThan(1);
  const state = await backupState(sw);
  expect(state!.downloadIds).toHaveLength(4);
  expect(state!.downloadIds).not.toContain(9001);
});

test("exports the records as Markdown", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const paper = await openArxiv(context, "2106.09685");
  await selectAndExplain(paper, "#t-lora");
  await expect(paper.locator("[data-hb=understood]")).toBeEnabled();

  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  const [download] = await Promise.all([library.waitForEvent("download"), library.locator("[data-hb=export-md]").click()]);
  const text = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  expect(text).toContain("## LoRA");
  expect(text).toContain("LoRA 是一个测试解释。");
  expect((await readEvents(sw)).length).toBeGreaterThan(0);
});

test("options can test a model connection", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator("[data-hb=model-test]").click();
  await expect(page.locator("[data-hb=model-result]")).toContainText("连接成功");
});
