import type { Page } from "@playwright/test";
import { expect, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test } from "./harness";

const explainWord = (page: Page, selector: string): Promise<void> => selectAndExplain(page, selector);

test("explains a selection, shows the tier and records it", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await openArxiv(context, "2106.09685");
  await explainWord(page, "#t-lora");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=explanation]")).toHaveText("LoRA 是一个测试解释。");
  await expect(card.locator("[data-hb=tier]")).toHaveText("外部知识");
  await expect(card.locator("[data-hb=understood]")).toBeEnabled();

  const encounter = (await readEvents(sw)).find((e) => e.type === "encounter.created");
  expect(encounter?.payload).toMatchObject({ selection: "LoRA", source_id: "arxiv:2106.09685", locator: { exact: "LoRA", section: "1 Introduction" } });
  expect(stub.requests).toHaveLength(1);
  expect(stub.requests[0]!.body.messages[1]!.content).toContain("We apply LoRA to the attention weights of the Transformer.");

  await card.locator("[data-hb=understood]").click();
  await expect
    .poll(async () => (await readEvents(sw)).some((e) => e.type === "encounter.action" && e.payload?.action === "marked_understood"))
    .toBe(true);
});

test("a second click on the same selection does not start a second request", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push({ delayMs: 250 });
  const page = await openArxiv(context, "2106.09685");
  await explainWord(page, "#t-lora");
  await explainWord(page, "#t-lora");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  expect(stub.requests).toHaveLength(1);
  expect((await readEvents(sw)).filter((e) => e.type === "encounter.created")).toHaveLength(1);
});

test("shows model errors and records nothing", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push({ status: 401 });
  const page = await openArxiv(context, "2106.09685");
  await explainWord(page, "#t-lora");
  await expect(page.locator("[data-hb=error]")).toContainText("API key");
  expect((await readEvents(sw)).filter((e) => e.type === "encounter.created")).toHaveLength(0);
});

test("never calls a model for a sensitive site without a local model", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { localModelId: null, sites: [{ pattern: "arxiv.org", sensitive: true }] }));
  const page = await openArxiv(context, "2106.09685");
  await explainWord(page, "#t-lora");
  await expect(page.locator("[data-hb=error]")).toContainText("只能使用本机模型");
  expect(stub.requests).toHaveLength(0);
});

test("asks whether a close match is the same concept", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const first = await openArxiv(context, "2106.09685");
  await explainWord(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();

  const second = await openArxiv(context, "2305.14314");
  await explainWord(second, "#t-loras");
  await expect(second.locator("[data-hb=ask]")).toContainText("这是你 0 天前查过的「LoRA」吗？");
  await second.locator("[data-hb=ask-yes]").click();
  await expect(second.locator("[data-hb=understood]")).toBeEnabled();

  const encounters = (await readEvents(sw)).filter((e) => e.type === "encounter.created");
  expect(encounters).toHaveLength(2);
  expect(encounters[1]!.payload?.concept_id).toBe(encounters[0]!.payload?.concept_id);
});

test("a failed follow-up keeps the card's actions and records nothing more", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await openArxiv(context, "2106.09685");
  await explainWord(page, "#t-lora");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=understood]")).toBeEnabled();
  stub.queue.push({ status: 500 });
  await card.locator("[data-hb=followup-open]").click();
  await card.locator("[data-hb=followup-input]").fill("和全量微调比呢？");
  await card.locator("[data-hb=followup-send]").click();
  await expect(card.locator("[data-hb=followup-answer]")).toContainText("模型服务返回了错误");
  await expect(card.locator("[data-hb=retry]")).toHaveCount(0);
  await expect(card.locator("[data-hb=understood]")).toBeEnabled();
  expect(stub.requests).toHaveLength(2);
  expect((await readEvents(sw)).filter((e) => e.type === "encounter.created")).toHaveLength(1);
});
