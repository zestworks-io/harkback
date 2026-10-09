import type { BrowserContext, Page } from "@playwright/test";
import { eventsOf, expect, seedSettings, selectAndExplain, sendToActiveTab, stubSettings, test } from "./harness";

const NOTION_ID = "0123456789abcdef0123456789abcdef";

/** Visits a page until the content script, which a settings change registers a moment later, is running on it. */
async function visit(context: BrowserContext, url: string, ready: (page: Page) => Promise<void>): Promise<Page> {
  const page = await context.newPage();
  await expect(async () => {
    await page.goto(url);
    await ready(page);
  }).toPass({ timeout: 25_000 });
  return page;
}

const lockShown = (page: Page) => expect(page.locator("[data-hb=lock]")).toBeVisible({ timeout: 4000 });
const sourcesOf = async (sw: Parameters<typeof eventsOf>[0], id: string) =>
  (await eventsOf(sw, "source.seen"))
    .map((e) => e.payload as { source_id: string; sensitivity: string; by_user?: boolean })
    .filter((p) => p.source_id === id);

test.describe("a private GitHub repository", () => {
  const URL_ = "https://github.com/acme/secret";

  test("asks before sending anything, then explains it with the local model only", async ({ context, sw, stub }) => {
    await seedSettings(sw, stubSettings(stub.url, { sites: [{ pattern: "github.com", autoScan: true }] }));
    const page = await visit(context, URL_, lockShown);

    await selectAndExplain(page, "#t-lora");
    await expect(page.locator("[data-hb=choice]")).toBeVisible();
    expect(stub.requests).toHaveLength(0);

    await page.locator("[data-hb=choose-local]").click();
    await expect(page.locator("[data-hb=explanation]")).toContainText("测试解释");
    await expect(page.locator("[data-hb=understood]")).toBeEnabled();
    expect(stub.requests).toHaveLength(1);

    expect(await sourcesOf(sw, "github:acme/secret")).toContainEqual(expect.objectContaining({ sensitivity: "sensitive", by_user: true }));
    const created = await eventsOf(sw, "encounter.created");
    expect(created.map((e) => (e.payload as { source_id: string }).source_id)).toContain("github:acme/secret");
    // The page shows that it is sensitive from now on.
    await expect(page.locator("[data-hb=lock]")).toContainText(/敏感/);
  });

  test("remembers that the reader chose to send it, and does not ask again", async ({ context, sw, stub }) => {
    await seedSettings(sw, stubSettings(stub.url, { sites: [{ pattern: "github.com", autoScan: true }] }));
    const page = await visit(context, URL_, lockShown);

    await selectAndExplain(page, "#t-lora");
    await page.locator("[data-hb=choose-anyway]").click();
    await expect(page.locator("[data-hb=understood]")).toBeEnabled();
    expect(await sourcesOf(sw, "github:acme/secret")).toContainEqual(expect.objectContaining({ sensitivity: "normal", by_user: true }));

    // Visiting again: no lock, and a second look-up goes straight through.
    await page.reload();
    // The page is fine now, so the lock does not come back (the content script has had time to look).
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-hb=lock]")).toHaveCount(0);
    await selectAndExplain(page, "#t-lora");
    await expect(page.locator("[data-hb=choice]")).toHaveCount(0);
    await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  });
});

test("does not ask about a public GitHub repository", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { sites: [{ pattern: "github.com", autoScan: true }] }));
  const page = await visit(context, "https://github.com/acme/open", async (p) => {
    await p.waitForSelector("#t-lora");
    await p.waitForTimeout(1500);
  });
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  await expect(page.locator("[data-hb=choice]")).toHaveCount(0);
  expect(stub.requests).toHaveLength(1);
});

test.describe("Notion", () => {
  const rules = [
    { pattern: "notion.so", autoScan: true },
    { pattern: "notion.site", autoScan: true },
  ];

  test("asks about a workspace page and names the page by its id", async ({ context, sw, stub }) => {
    await seedSettings(sw, stubSettings(stub.url, { sites: rules }));
    const page = await visit(context, `https://www.notion.so/acme/Q4-plan-${NOTION_ID}`, lockShown);
    await selectAndExplain(page, "#t-lora");
    await expect(page.locator("[data-hb=choice]")).toBeVisible();
    expect(stub.requests).toHaveLength(0);
    await page.locator("[data-hb=choose-local]").click();
    await expect(page.locator("[data-hb=understood]")).toBeEnabled();
    expect(await sourcesOf(sw, `notion:${NOTION_ID}`)).toContainEqual(expect.objectContaining({ sensitivity: "sensitive" }));
  });

  test("does not ask about a published page", async ({ context, sw, stub }) => {
    await seedSettings(sw, stubSettings(stub.url, { sites: rules }));
    const page = await visit(context, `https://acme.notion.site/Q4-plan-${NOTION_ID}`, async (p) => {
      await p.waitForSelector("#t-lora");
      await p.waitForTimeout(1500);
    });
    await selectAndExplain(page, "#t-lora");
    await expect(page.locator("[data-hb=understood]")).toBeEnabled();
    await expect(page.locator("[data-hb=choice]")).toHaveCount(0);
  });
});

test.describe("Google Docs", () => {
  const rules = [{ pattern: "docs.google.com", autoScan: true }];

  test("says the editor cannot be read", async ({ context, sw, stub }) => {
    await seedSettings(sw, stubSettings(stub.url, { sites: rules }));
    const page = await visit(context, "https://docs.google.com/document/d/abc123/edit", lockShown);
    await sendToActiveTab(sw, { type: "preview" });
    await expect(page.locator("[data-hb=preview]")).toContainText("Google");
    await expect(page.locator("[data-hb=preview-scan]")).toHaveCount(0);
    expect(stub.requests).toHaveLength(0);
  });

  test("reads a published document without asking", async ({ context, sw, stub }) => {
    await seedSettings(sw, stubSettings(stub.url, { sites: rules }));
    const page = await visit(context, "https://docs.google.com/document/d/e/2PACX-abc/pub", async (p) => {
      await p.waitForSelector("#t-lora");
      await p.waitForTimeout(1500);
    });
    await selectAndExplain(page, "#t-lora");
    await expect(page.locator("[data-hb=understood]")).toBeEnabled();
    await expect(page.locator("[data-hb=choice]")).toHaveCount(0);
    const created = await eventsOf(sw, "encounter.created");
    expect(created.map((e) => (e.payload as { source_id: string }).source_id)).toContain("gdoc:e/2PACX-abc");
  });
});
