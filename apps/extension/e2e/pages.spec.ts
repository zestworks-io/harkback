import type { Worker } from "@playwright/test";
import { expect, seedSettings, stubSettings, test, type ChromeApi } from "./harness";

interface StoredSettings {
  onboarded: boolean;
  language: string;
  defaultModelId: string | null;
  localModelId: string | null;
  sites: unknown[];
}

async function storedSettings(sw: Worker): Promise<StoredSettings> {
  return sw.evaluate(
    async () => (await (globalThis as unknown as { chrome: ChromeApi }).chrome.storage.local.get("settings")).settings,
  ) as Promise<StoredSettings>;
}

test("onboarding connects to a local model and saves settings", async ({ context, sw, stub }) => {
  const page =
    context.pages().find((p) => p.url().endsWith("/onboarding.html")) ??
    (await context.waitForEvent("page", { predicate: (p) => p.url().endsWith("/onboarding.html") }));
  await page.locator("[data-hb=base-url]").fill(`${stub.url}/v1`);
  await page.locator("[data-hb=test]").click();
  await expect(page.locator("[data-hb=test-result]")).toContainText("连接成功");
  await expect(page.locator("[data-hb=model]")).toHaveValue("stub-model");
  await page.locator("[data-hb=finish]").click();
  await expect(page.locator("[data-hb=test-result]")).toContainText("请先阅读并同意");
  await page.locator("[data-hb=consent]").check();
  await page.locator("[data-hb=finish]").click();
  await expect(page.locator("[data-hb=done]")).toBeVisible();
  const settings = await storedSettings(sw);
  expect(settings.onboarded).toBe(true);
  expect(settings.defaultModelId).not.toBeNull();
  expect(settings.localModelId).toBe(settings.defaultModelId);
});

test("options save site rules and reject an insecure remote model", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator("[data-hb=add-site]").click();
  await page.locator("[data-hb=site-pattern]").fill("blog.example.com");
  await page.locator("[data-hb=site-sensitive]").check();
  await page.locator("[data-hb=save]").click();
  await expect(page.locator("[data-hb=status]")).toHaveText("已保存。");
  expect((await storedSettings(sw)).sites).toEqual([{ pattern: "blog.example.com", sensitive: true }]);

  await page.locator("[data-hb=add-model]").click();
  await page.locator("[data-hb=model-base-url]").last().fill("http://api.example.com/v1");
  await page.locator("[data-hb=model-name]").last().fill("gpt");
  await page.locator("[data-hb=save]").click();
  await expect(page.locator("[data-hb=status]")).toContainText("models[1].baseUrl");
});
