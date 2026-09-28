import { expect, openArxiv, seedSettings, selectAndExplain, sendToActiveTab, stubSettings, test } from "./harness";

test("scans a site that is on the allow-list without any click", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { sites: [{ pattern: "blog.example.com", autoScan: true }] }));
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();

  // The content script is registered by the settings change; give it a moment on the first visit.
  await expect(async () => {
    const blog = await context.newPage();
    await blog.goto("https://blog.example.com/posts/adapters");
    await expect(blog.locator("[data-hb=mark]")).toHaveCount(1, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });
});

test("does not scan a site that is not on the allow-list", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();

  const blog = await context.newPage();
  await blog.goto("https://blog.example.com/posts/adapters");
  await blog.waitForTimeout(1500);
  await expect(blog.locator("[data-hb=mark]")).toHaveCount(0);
});

test("the shortcut message explains the current selection", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await openArxiv(context, "2106.09685");
  await expect(async () => {
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#t-lora")!);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.bringToFront();
    await sendToActiveTab(sw, { type: "explain-selection" });
    await expect(page.locator("[data-hb=explanation]")).toHaveText("LoRA 是一个测试解释。", { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  expect(stub.requests).toHaveLength(1);
});
