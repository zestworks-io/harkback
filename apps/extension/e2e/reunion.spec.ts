import type { BrowserContext, Page } from "@playwright/test";
import { expect, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test } from "./harness";

async function lookUpLoraOnFirstPaper(context: BrowserContext): Promise<void> {
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();
}

async function hover(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test("shows a reunion on another paper and records that the reader remembers", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLoraOnFirstPaper(context);

  const second = await openArxiv(context, "2305.14314");
  const marks = second.locator("[data-hb=mark]");
  await expect(marks).toHaveCount(1);
  await hover(second, "#t-lora");
  const card = second.locator("[data-hb=reunion-card]");
  await expect(card.locator("[data-hb=reunion-title]")).toHaveText(
    "LoRA · 0 天前 · 《LoRA: Low-Rank Adaptation of Large Language Models》 §1 Introduction",
  );
  await expect(card).toContainText("当时的解释：LoRA 是一个测试解释。");

  await card.locator("[data-hb=recalled]").click();
  await expect(marks).toHaveCount(0);
  await expect
    .poll(async () => (await readEvents(sw)).some((e) => e.type === "encounter.action" && e.payload?.action === "reunion_recalled"))
    .toBe(true);
});

test("does not show reunions on the page where the concept was looked up", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLoraOnFirstPaper(context);
  const again = await openArxiv(context, "2106.09685");
  await again.waitForTimeout(1000);
  await expect(again.locator("[data-hb=mark]")).toHaveCount(0);
});

test("muting stops the reunion", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLoraOnFirstPaper(context);
  const second = await openArxiv(context, "2305.14314");
  await expect(second.locator("[data-hb=mark]")).toHaveCount(1);
  await hover(second, "#t-lora");
  await second.locator("[data-hb=reunion-card] [data-hb=mute]").click();
  await expect.poll(async () => (await readEvents(sw)).some((e) => e.type === "concept.muted")).toBe(true);
  const reopened = await openArxiv(context, "2305.14314");
  await reopened.waitForTimeout(1000);
  await expect(reopened.locator("[data-hb=mark]")).toHaveCount(0);
});

test("saying a term means something else stops the reunion on that paper only", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLoraOnFirstPaper(context);
  const second = await openArxiv(context, "2305.14314");
  await expect(second.locator("[data-hb=mark]")).toHaveCount(1);
  await hover(second, "#t-lora");
  await second.locator("[data-hb=reunion-card] [data-hb=different]").click();
  await expect(second.locator("[data-hb=mark]")).toHaveCount(0);
  await expect.poll(async () => (await readEvents(sw)).some((e) => e.type === "reunion.dismissed")).toBe(true);
  expect((await readEvents(sw)).some((e) => e.type === "concept.muted")).toBe(false);
  const reopened = await openArxiv(context, "2305.14314");
  await reopened.waitForTimeout(1000);
  await expect(reopened.locator("[data-hb=mark]")).toHaveCount(0);
  const dismissed = (await readEvents(sw)).find((e) => e.type === "reunion.dismissed")!;
  expect(dismissed.payload).toMatchObject({ source_id: "arxiv:2305.14314" });
});

test("compare from a reunion records a new explanation and marks the earlier one", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLoraOnFirstPaper(context);
  const second = await openArxiv(context, "2305.14314");
  await expect(second.locator("[data-hb=mark]")).toHaveCount(1);
  await hover(second, "#t-lora");
  await second.locator("[data-hb=reunion-card] [data-hb=compare]").click();
  await expect(second.locator("[data-hb=card]:not([data-hb=reunion-card]) [data-hb=explanation]")).toHaveText("LoRA 是一个测试解释。");
  await expect
    .poll(async () => (await readEvents(sw)).some((e) => e.type === "encounter.action" && e.payload?.action === "reunion_compare"))
    .toBe(true);
  expect(stub.requests.at(-1)!.body.messages[1]!.content).toContain("<earlier_content>");
});
