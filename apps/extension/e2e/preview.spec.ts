import { expect, openArxiv, seedSettings, selectAndExplain, sendToActiveTab, stubSettings, test } from "./harness";

test("scans a page for its concepts only after the reader agrees, and previews them", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();
  await first.locator("[data-hb=confused]").click();
  await first.waitForTimeout(300);

  const second = await openArxiv(context, "2305.14314");
  await expect(second.locator("[data-hb=mark]")).toHaveCount(1);
  const before = stub.requests.length;
  await second.bringToFront();
  await sendToActiveTab(sw, { type: "preview" });
  const panel = second.locator("[data-hb=preview]");
  await expect(panel.locator("[data-hb=preview-ask]")).toBeVisible();
  await expect(panel.locator("[data-hb=preview-where]")).toHaveText("页面文字会留在本机，使用本机模型 Stub。");
  await second.waitForTimeout(500);
  expect(stub.requests).toHaveLength(before);

  stub.queue.push({ body: "<terms>\nLoRA\nQLoRA\nNF4\n</terms>" });
  await panel.locator("[data-hb=preview-scan]").click();
  const confused = panel.locator("[data-hb=preview-group][data-status=confused]");
  await expect(confused.locator("[data-hb=preview-term]")).toHaveText([/LoRA/]);
  await expect(panel.locator("[data-hb=preview-group][data-status=new] [data-hb=preview-term]")).toHaveCount(2);
  const scanned = stub.requests.at(-1)!.body.messages;
  expect(scanned[1]!.content).toContain("Title:");

  // A known term shows the reader's own explanation without asking the model.
  const calls = stub.requests.length;
  await confused.locator("[data-hb=preview-open]").click();
  await expect(confused.locator("[data-hb=preview-text]")).toHaveText("LoRA 是一个测试解释。");
  expect(stub.requests).toHaveLength(calls);

  // A new term is written by the model, and nothing is recorded for it.
  stub.queue.push({ body: "NF4 is a 4-bit data type for normally distributed weights." });
  const nf4 = panel.locator("[data-hb=preview-term]", { hasText: "NF4" });
  await nf4.locator("[data-hb=preview-open]").click();
  await expect(nf4.locator("[data-hb=preview-text]")).toHaveText("NF4 is a 4-bit data type for normally distributed weights.");

  await panel.locator("[data-hb=close]").click();
  await expect(panel).toHaveCount(0);
});
