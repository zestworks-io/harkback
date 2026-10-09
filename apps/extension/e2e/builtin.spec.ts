import type { Worker } from "@playwright/test";
import { expect, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test } from "./harness";

const NANO = {
  id: "nano",
  label: "Chrome built-in (Gemini Nano)",
  baseUrl: "chrome-ai://prompt-api",
  apiKey: "",
  model: "gemini-nano",
  provider: "chrome-ai",
};

const REPLY = [
  "<explanation>LoRA 在冻结的权重旁训练小的低秩矩阵。</explanation>",
  "<evidence>NONE</evidence>",
  `<card>${JSON.stringify({ match: null, canonical: "LoRA", aliases: [], domain: "ml", broader: [], variants: [], prerequisites: [], confidence: {} })}</card>`,
].join("\n");

/** Headless Chromium has the Prompt API but no model; this stands in for one that is installed. */
async function installFakeModel(sw: Worker, reply: string): Promise<void> {
  await sw.evaluate((text) => {
    const fake = {
      availability: async () => "available",
      create: async () => ({
        promptStreaming: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(text.slice(0, 20));
              controller.enqueue(text.slice(20));
              controller.close();
            },
          }),
        destroy() {},
      }),
    };
    Object.defineProperty(globalThis, "LanguageModel", { value: fake, configurable: true, writable: true });
  }, reply);
}

test("explains with Chrome's built-in model, with no request to any address", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { models: [NANO], defaultModelId: "nano", localModelId: "nano" }));
  await installFakeModel(sw, REPLY);
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=explanation]")).toHaveText("LoRA 在冻结的权重旁训练小的低秩矩阵。");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  expect(stub.requests).toHaveLength(0);
  expect((await readEvents(sw)).some((e) => e.type === "encounter.created")).toBe(true);
});

test("says the built-in model is not ready when it is not downloaded", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { models: [NANO], defaultModelId: "nano", localModelId: "nano" }));
  await sw.evaluate(() => {
    Object.defineProperty(globalThis, "LanguageModel", {
      value: { availability: async () => "downloadable", create: async () => Promise.reject(new Error("needs a click")) },
      configurable: true,
      writable: true,
    });
  });
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=error]")).toContainText("内置模型还不能用");
});

test("settings hide the address and key for the built-in model, and say what state it is in", async ({
  context,
  sw,
  stub,
  extensionId,
}) => {
  await seedSettings(sw, stubSettings(stub.url, { language: "en" }));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator("[data-hb=add-model]").click();
  const row = page.locator("[data-hb=model-row]").last();
  await row.locator("[data-hb=model-provider]").selectOption("chrome-ai");
  await expect(row.locator("[data-hb=model-base-url]")).toHaveCount(0);
  await expect(row.locator("[data-hb=model-name]")).toHaveCount(0);
  await expect(row.locator("[data-hb=model-builtin-note]")).toContainText("no address or API key");
  // The e2e browser has the API but no model on this device.
  await expect(row.locator("[data-hb=model-result]")).toContainText(/Not available on this device|Not downloaded yet|Ready/);
  await page.locator("[data-hb=save]").click();
  await expect(page.locator("[data-hb=status]")).toHaveText("Saved.");

  await row.locator("[data-hb=model-provider]").selectOption("openai");
  await expect(row.locator("[data-hb=model-base-url]")).toHaveValue("https://api.openai.com/v1");
  await expect(row.locator("[data-hb=model-name]")).toHaveValue("");
});
