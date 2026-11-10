import type { Page, Worker } from "@playwright/test";
import { expect, openArxiv, seedSettings, selectAndExplain, sendToActiveTab, stubSettings, test, type ChromeApi } from "./harness";

const POST = "https://example.github.io/posts/fine-tuning/";

/** What the toolbar button does on a site that is not on the list: run Harkback in that tab, then offer the preview. */
async function pressToolbarButton(sw: Worker, page: Page): Promise<void> {
  await page.bringToFront();
  await sw.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: ChromeApi & { scripting: { executeScript(o: unknown): Promise<unknown> } } }).chrome;
    const [tab] = await chrome.tabs.query({ active: true });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ["/content-scripts/content.js"] });
  });
  await expect(async () => {
    await sendToActiveTab(sw, { type: "preview" });
    await expect(page.locator("[data-hb=preview]")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** The address of the active tab in each open window (empty for a page the extension cannot see the address of). */
async function windowsAndActiveTabs(sw: Worker): Promise<string[]> {
  return sw.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ url?: string; windowId: number }[]> } } })
      .chrome;
    return (await chrome.tabs.query({ active: true })).map((t) => t.url ?? "");
  });
}

async function storedSites(sw: Worker): Promise<unknown> {
  return sw.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: ChromeApi }).chrome;
    return ((await chrome.storage.local.get("settings")).settings as { sites: unknown }).sites;
  });
}

test("the preview panel says reunion hints are off on a new site, and turning them on shows them at once and on every visit", async ({
  context,
  sw,
  stub,
}) => {
  await seedSettings(sw, stubSettings(stub.url));
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();

  const post = await context.newPage();
  await post.goto(POST);
  await post.waitForTimeout(1000);
  await expect(post.locator("[data-hb=mark]")).toHaveCount(0);

  await pressToolbarButton(sw, post);
  const status = post.locator("[data-hb=preview] [data-hb=site-status]");
  await expect(status).toHaveText("本站重逢提示：未开启 · 开启");

  // It opens as a tab next to the page; Not now closes it and changes nothing.
  let popup = context.waitForEvent("page");
  await status.locator("[data-hb=site-turn-on]").click();
  let win = await popup;
  await expect(win.locator("[data-hb=site-access-title]")).toHaveText("在 example.github.io 上显示重逢提示？");
  await win.locator("[data-hb=site-not-now]").click();
  await expect.poll(() => win.isClosed()).toBe(true);
  expect(await storedSites(sw)).toEqual([]);
  await expect(status).toHaveText("本站重逢提示：未开启 · 开启");

  popup = context.waitForEvent("page");
  await status.locator("[data-hb=site-turn-on]").click();
  win = await popup;
  // In the same window: still one window, one active tab.
  expect(await windowsAndActiveTabs(sw)).toHaveLength(1);
  await win.locator("[data-hb=site-allow]").click();
  await expect.poll(() => win.isClosed()).toBe(true);
  // Back on the article.
  await expect.poll(() => windowsAndActiveTabs(sw)).toEqual([POST]);
  expect(await storedSites(sw)).toEqual([{ pattern: "example.github.io", autoScan: true }]);
  await expect(status).toHaveText("本站重逢提示：已开启");
  await expect(status.locator("[data-hb=site-turn-on]")).toHaveCount(0);

  // The page is told at once; the next visit needs no click.
  await expect(post.locator("[data-hb=mark]")).toHaveCount(1);
  await expect(async () => {
    const again = await context.newPage();
    await again.goto(POST);
    await expect(again.locator("[data-hb=mark]")).toHaveCount(1, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });
});

test("arXiv says reunion hints are on, with nothing to turn on", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const paper = await openArxiv(context, "2106.09685");
  await expect(async () => {
    await paper.bringToFront();
    await sendToActiveTab(sw, { type: "preview" });
    await expect(paper.locator("[data-hb=preview]")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(paper.locator("[data-hb=site-status]")).toHaveText("本站重逢提示：已开启");
});
