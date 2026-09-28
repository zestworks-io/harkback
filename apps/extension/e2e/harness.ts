import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStubServer, type StubServer } from "./stub-server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = [".output/chrome-mv3-e2e", ".output/chrome-mv3"]
  .map((p) => path.join(root, p))
  .find((p) => existsSync(path.join(p, "manifest.json")));

/** The subset of chrome.* used inside sw.evaluate callbacks (they run in the service worker). */
export interface ChromeApi {
  storage: { local: { set(items: Record<string, unknown>): Promise<void>; get(key: string): Promise<Record<string, unknown>> } };
  alarms: { get(name: string): Promise<unknown>; create(name: string, info: { when: number }): Promise<void> };
  tabs: { query(q: Record<string, unknown>): Promise<{ id?: number }[]>; sendMessage(id: number, m: unknown): Promise<unknown> };
  downloads: { search(query: Record<string, unknown>): Promise<{ filename: string; state: string }[]> };
}

function fixture(name: string): string {
  return readFileSync(path.join(root, "fixtures", name), "utf8");
}

export const test = base.extend<{ stub: StubServer; context: BrowserContext; sw: Worker; extensionId: string }>({
  stub: async ({}, use) => {
    const stub = await startStubServer();
    await use(stub);
    await stub.close();
  },
  context: async ({}, use) => {
    if (!extensionPath) throw new Error("Build first: pnpm --filter @harkback/extension build:e2e");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await context.route("https://arxiv.org/**", (route) => {
      const id = /\/(?:html|abs)\/(\d{4}\.\d{4,5})/.exec(route.request().url())?.[1];
      const file = id ? `arxiv-${id}.html` : null;
      if (file && existsSync(path.join(root, "fixtures", file))) {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture(file) });
      }
      return route.fulfill({ status: 404, body: "not found" });
    });
    await context.route("https://blog.example.com/**", (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("blog.html") }),
    );
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    // Ports opened before the worker is registered get no answer, so always wait for it first.
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
});

export { expect };

export function stubSettings(stubUrl: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    onboarded: true,
    consentAt: "2026-09-25T00:00:00.000Z",
    language: "zh",
    models: [{ id: "stub", label: "Stub", baseUrl: `${stubUrl}/v1`, apiKey: "", model: "stub-model" }],
    defaultModelId: "stub",
    localModelId: "stub",
    sites: [],
    rateLimit: { perMinute: 100, perHour: 1000 },
    reunion: { minGapDays: 0, maxPerPage: 3 },
    backup: { enabled: false },
    ...extra,
  };
}

export async function seedSettings(sw: Worker, settings: Record<string, unknown>): Promise<void> {
  await sw.evaluate(async (s) => {
    await (globalThis as unknown as { chrome: ChromeApi }).chrome.storage.local.set({ settings: s });
  }, settings);
}

export async function readEvents(sw: Worker): Promise<{ type: string; payload: Record<string, unknown> | null }[]> {
  return sw.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("harkback");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction("events").objectStore("events").getAll();
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

export async function openArxiv(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`https://arxiv.org/html/${id}`);
  return page;
}

/** Selects a word and presses the explain button; retries the selection while the content script is still starting. */
export async function selectAndExplain(page: Page, selector: string): Promise<void> {
  const button = page.locator("[data-hb=explain-button]");
  await expect(async () => {
    await page.locator(selector).dblclick();
    await expect(button).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await button.click();
}

/** Delivers a message from the service worker to the content script of the active tab, like the toolbar button and the shortcut do. */
export async function sendToActiveTab(sw: Worker, message: { type: string }): Promise<void> {
  await sw.evaluate(
    async (message) => {
      const chrome = (globalThis as unknown as { chrome: ChromeApi }).chrome;
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.tabs.sendMessage(tab!.id!, message);
    },
    message,
  );
}

export async function eventsOf(sw: Worker, type: string): Promise<{ type: string; payload: Record<string, unknown> | null }[]> {
  return (await readEvents(sw)).filter((e) => e.type === type);
}
