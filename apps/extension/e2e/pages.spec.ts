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
  await page.locator("[data-hb=next]").click();
  await expect(page.locator("[data-hb=next]")).toBeDisabled();
  await page.locator("[data-hb=consent]").check();
  await expect(page.locator("[data-hb=next]")).toBeEnabled();
  await page.locator("[data-hb=next]").click();
  await page.locator("[data-hb=base-url]").fill(`${stub.url}/v1`);
  await page.locator("[data-hb=test]").click();
  await expect(page.locator("[data-hb=test-result]")).toContainText("Connected");
  await expect(page.locator("[data-hb=model]")).toHaveValue("stub-model");
  await page.locator("[data-hb=finish]").click();
  await expect(page.locator("[data-hb=done]")).toBeVisible();
  const settings = await storedSettings(sw);
  expect(settings.onboarded).toBe(true);
  expect(settings.defaultModelId).not.toBeNull();
  expect(settings.localModelId).toBe(settings.defaultModelId);
});

test("onboarding offers Chrome's built-in model, hides the address fields for it and points to settings", async ({ context }) => {
  const page =
    context.pages().find((p) => p.url().endsWith("/onboarding.html")) ??
    (await context.waitForEvent("page", { predicate: (p) => p.url().endsWith("/onboarding.html") }));
  await page.locator("[data-hb=next]").click();
  await page.locator("[data-hb=consent]").check();
  await page.locator("[data-hb=next]").click();
  await expect(page.locator("[data-hb=more-in-settings]")).toBeVisible();
  await page.locator("[data-hb=template] label", { hasText: "Chrome" }).click();
  await expect(page.locator("[data-hb=remote-fields]")).toBeHidden();
  await expect(page.locator("[data-hb=builtin-panel]")).toBeVisible();
  await expect(page.locator("[data-hb=builtin-result]")).not.toBeEmpty();
  // Without a ready model, finishing says so instead of saving a model that cannot answer.
  if ((await page.locator("[data-hb=builtin-result]").getAttribute("data-state")) !== "ok") {
    await page.locator("[data-hb=finish]").click();
    await expect(page.locator("[data-hb=test-result]")).toContainText("built-in model");
  }
});

test("options save site rules and reject an insecure remote model", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#sites`);
  await page.locator("[data-hb=add-site]").click();
  await page.locator("[data-hb=site-pattern]").fill("blog.example.com");
  await page.locator("[data-hb=site-sensitive]").check();
  await page.locator("[data-hb=save]").click();
  await expect(page.locator("[data-hb=status]")).toHaveText("已保存。");
  expect((await storedSettings(sw)).sites).toEqual([{ pattern: "blog.example.com", sensitive: true }]);

  await page.locator("[data-hb=tab-models]").click();
  await page.locator("[data-hb=add-model]").click();
  await page.locator("[data-hb=model-base-url]").last().fill("http://api.example.com/v1");
  await page.locator("[data-hb=model-name]").last().fill("gpt");
  await page.locator("[data-hb=save]").click();
  await expect(page.locator("[data-hb=status]")).toContainText("models[1].baseUrl");
});

test("options pick a provider, which fills the address and decides the format, and keep a custom address", async ({
  context,
  sw,
  stub,
  extensionId,
}) => {
  await seedSettings(sw, stubSettings(stub.url, { language: "en" }));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // A new row: the seeded model is the sensitive-source model, which has to stay local.
  await page.locator("[data-hb=add-model]").click();
  const provider = page.locator("[data-hb=model-provider]").last();
  const address = page.locator("[data-hb=model-base-url]").last();
  const modelName = page.locator("[data-hb=model-name]").last();
  await expect(provider).toHaveValue("ollama");
  await expect(page.locator("[data-hb=model-api-type]")).toHaveCount(0);

  await provider.selectOption("anthropic");
  await expect(address).toHaveValue("https://api.anthropic.com/v1");
  await expect(modelName).toHaveAttribute("placeholder", "claude-sonnet-5-5");

  await provider.selectOption("grok");
  await expect(address).toHaveValue("https://api.x.ai/v1");

  await provider.selectOption("custom");
  await address.fill("https://llm.blog.example.com/v1");
  await expect(provider).toHaveValue("custom");

  await modelName.fill("some-model");
  await page.locator("[data-hb=save]").click();
  await expect(page.locator("[data-hb=status]")).toHaveText("Saved.");
  const saved = ((await storedSettings(sw)) as unknown as { models: { baseUrl: string; provider: string; model: string }[] }).models;
  expect(saved[1]).toMatchObject({ baseUrl: "https://llm.blog.example.com/v1", provider: "custom", model: "some-model" });
});

test("options switch the interface and the explanation language", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url, { language: "en" }));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#general`);
  await expect(page.locator("h1")).toHaveText("Harkback settings");

  await page.getByLabel("Interface language").selectOption("ja");
  await expect(page.locator("h1")).toHaveText("Harkback の設定");
  await page.getByLabel("解説の言語").selectOption("ko");

  await page.locator("[data-hb=save]").click();
  await expect(page.locator("[data-hb=status]")).toHaveText("保存しました。");
  const saved = (await storedSettings(sw)) as unknown as { language: string; explainLanguage: string };
  expect(saved).toMatchObject({ language: "ja", explainLanguage: "ko" });
});
