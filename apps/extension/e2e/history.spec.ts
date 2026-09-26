import type { BrowserContext, Worker } from "@playwright/test";
import { expect, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test, type ChromeApi } from "./harness";

async function lookUpLora(context: BrowserContext): Promise<void> {
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
}

async function backupState(sw: Worker): Promise<{ lastAt: number | null; downloadIds: number[] } | undefined> {
  return sw.evaluate(async () => (await (globalThis as unknown as { chrome: ChromeApi }).chrome.storage.local.get("backupState")).backupState) as Promise<
    { lastAt: number | null; downloadIds: number[] } | undefined
  >;
}

test("lists, searches and deletes recorded explanations", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/history.html`);
  await expect(page.locator("[data-hb=concept] h2")).toHaveText(["LoRA"]);
  await expect(page.locator("[data-hb=entry]")).toContainText("《LoRA: Low-Rank Adaptation of Large Language Models》");
  await expect(page.locator("[data-hb=entry]")).toContainText("LoRA 是一个测试解释。");

  await page.locator("[data-hb=search]").fill("no such thing");
  await expect(page.locator("[data-hb=empty]")).toBeVisible();
  await page.locator("[data-hb=search]").fill("测试解释");
  await expect(page.locator("[data-hb=entry]")).toHaveCount(1);

  await page.locator("[data-hb=delete]").click();
  await page.locator("[data-hb=delete]").click();
  await expect(page.locator("[data-hb=empty]")).toBeVisible();
  const events = await readEvents(sw);
  expect(events.some((e) => e.type === "encounter.deleted")).toBe(true);
  expect(events.find((e) => e.type === "encounter.created")?.payload).toBeNull();
});

test("backs up the event log on demand", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/history.html`);
  await page.locator("[data-hb=backup-now]").click();
  await expect(page.locator("[data-hb=status]")).toHaveText("已备份。");
  const state = await backupState(sw);
  expect(state?.downloadIds).toHaveLength(1);
  expect(typeof state?.lastAt).toBe("number");
});
