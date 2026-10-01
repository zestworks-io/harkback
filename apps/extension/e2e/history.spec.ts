import type { BrowserContext, Worker } from "@playwright/test";
import { eventsOf, expect, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test, type ChromeApi } from "./harness";

async function lookUpLora(context: BrowserContext): Promise<void> {
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
}

async function backupState(sw: Worker): Promise<{ lastAt: number | null; downloadIds: number[] } | undefined> {
  return sw.evaluate(
    async () => (await (globalThis as unknown as { chrome: ChromeApi }).chrome.storage.local.get("backupState")).backupState,
  ) as Promise<{ lastAt: number | null; downloadIds: number[] } | undefined>;
}

test("lists, searches and deletes recorded explanations", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(page.locator("[data-hb=concept] h2")).toHaveText(["LoRA"]);
  await expect(page.locator("[data-hb=entry]")).toContainText("《LoRA: Low-Rank Adaptation of Large Language Models》");
  await expect(page.locator("[data-hb=entry]")).toContainText("LoRA 是一个测试解释。");

  await page.locator("[data-hb=search]").fill("no such thing");
  await expect(page.locator("[data-hb=empty]")).toBeVisible();
  await page.locator("[data-hb=search]").fill("测试解释");
  await expect(page.locator("[data-hb=entry]")).toHaveCount(1);

  await page.locator("[data-hb=delete]").click();
  await page.locator("[data-hb=delete]").click();
  await expect(page.locator("[data-hb=empty]")).toBeVisible();
  const events = await readEvents(sw);
  expect(events.some((e) => e.type === "encounter.deleted")).toBe(true);
  expect(events.find((e) => e.type === "encounter.created")?.payload).toBeNull();
});

test("opens a concept page from the list and returns", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await page.locator("[data-hb=concept] h2 a").click();
  await expect(page).toHaveURL(/#concept=/);
  await expect(page.locator("[data-hb=concept-detail] h2")).toHaveText("LoRA");
  await expect(page.locator("[data-hb=understanding]")).toBeVisible();
  await expect(page.locator("[data-hb=entry]")).toHaveCount(1);
  await expect(page.locator("[data-hb=search]")).toBeHidden();

  await page.locator("[data-hb=back]").click();
  await expect(page.locator("[data-hb=concept] h2")).toHaveText(["LoRA"]);

  await page.goto(`chrome-extension://${extensionId}/library.html#concept=missing`);
  await expect(page.locator("[data-hb=not-found]")).toBeVisible();
});

test("reviews a concept that is due and records the answer", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.clock.setFixedTime(Date.now() + 2 * 86_400_000);
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(page.locator("[data-hb=review-link]")).toContainText("(1)");
  await page.locator("[data-hb=review-link]").click();
  await expect(page.locator("[data-hb=review-card] h2")).toHaveText("LoRA");
  await expect(page.locator("[data-hb=review-card]")).not.toContainText("LoRA 是一个测试解释。");
  await page.locator("[data-hb=review-show]").click();
  await expect(page.locator("[data-hb=review-card]")).toContainText("LoRA 是一个测试解释。");
  await page.locator("[data-hb=review-remembered]").click();
  await expect(page.locator("[data-hb=review-done]")).toBeVisible();
  const actions = await eventsOf(sw, "encounter.action");
  expect(actions.map((e) => e.payload?.action)).toContain("marked_understood");
  await expect(page.locator("[data-hb=review-link]")).toContainText("(0)");
});

test("keeps the toolbar badge empty when nothing is due", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const badge = () =>
    sw.evaluate(() =>
      (globalThis as unknown as { chrome: { action: { getBadgeText(d: object): Promise<string> } } }).chrome.action.getBadgeText({}),
    );
  await expect.poll(badge).toBe("");
});

test("corrects a concept: adds an alias, mutes and unmutes it", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await page.locator("[data-hb=concept] h2 a").click();

  await page.locator("[data-hb=alias-input]").fill("Low-rank adapters");
  await page.locator("[data-hb=alias-add]").click();
  await expect(page.locator("[data-hb=concept-detail] .aliases")).toContainText("Low-rank adapters");

  await page.locator("[data-hb=mute]").click();
  await expect(page.locator("[data-hb=muted-note]")).toBeVisible();
  await page.locator("[data-hb=mute]").click();
  await expect(page.locator("[data-hb=muted-note]")).toHaveCount(0);

  const types =
    (await eventsOf(sw, "concept.alias_added")).length +
    (await eventsOf(sw, "concept.muted")).length +
    (await eventsOf(sw, "concept.unmuted")).length;
  expect(types).toBe(3);
});

test("backs up the event log on demand", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await page.locator("[data-hb=backup-now]").click();
  await expect(page.locator("[data-hb=status]")).toHaveText("已备份。");
  const state = await backupState(sw);
  expect(state?.downloadIds).toHaveLength(1);
  expect(typeof state?.lastAt).toBe("number");
});

const reply = (explanation: string, card: Record<string, unknown>) =>
  `<explanation>${explanation}</explanation>\n<evidence>NONE</evidence>\n<card>${JSON.stringify({
    match: null,
    canonical: "term",
    aliases: [],
    domain: "ml",
    broader: [],
    variants: [],
    prerequisites: [],
    confidence: {},
    ...card,
  })}</card>`;

test("removes a wrong relation from a concept page", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push({
    body: reply("LoRA is low-rank adaptation.", { canonical: "LoRA", variants: ["QLoRA"], confidence: { variants: 0.9 } }),
  });
  await lookUpLora(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await page.locator("[data-hb=concept] h2 a").click();
  await expect(page.locator("[data-hb=related]")).toHaveText(["QLoRA"]);

  await page.locator("[data-hb=reject-edge]").click();
  await expect(page.locator("[data-hb=related]")).toHaveCount(0);
  expect(await eventsOf(sw, "edge.rejected")).toHaveLength(1);
});

test("merges one concept into another only after a second click", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const arxiv = await openArxiv(context, "2106.09685");
  await selectAndExplain(arxiv, "#t-matrix");
  await expect(arxiv.locator("[data-hb=understood]")).toBeEnabled();

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(page.locator("[data-hb=concept]")).toHaveCount(2);
  await page.locator("[data-hb=concept] h2 a", { hasText: "LoRA" }).click();
  await page.locator("[data-hb=merge-target]").fill("matrix");
  await page.locator("[data-hb=merge]").click();
  expect(await eventsOf(sw, "concept.merged")).toHaveLength(0);
  await page.locator("[data-hb=merge]").click();

  await expect(page.locator("[data-hb=entry]")).toHaveCount(2);
  expect(await eventsOf(sw, "concept.merged")).toHaveLength(1);
  await page.locator("[data-hb=back]").click();
  await expect(page.locator("[data-hb=concept]")).toHaveCount(1);
});

test("refuses an alias that belongs to another concept", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const arxiv = await openArxiv(context, "2106.09685");
  await selectAndExplain(arxiv, "#t-matrix");
  await expect(arxiv.locator("[data-hb=understood]")).toBeEnabled();

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await page.locator("[data-hb=concept] h2 a", { hasText: "LoRA" }).click();
  await page.locator("[data-hb=alias-input]").fill("matrix");
  await page.locator("[data-hb=alias-add]").click();
  await expect(page.locator("[data-hb=status]")).toContainText(/Merge|合并/);
  expect(await eventsOf(sw, "concept.alias_added")).toHaveLength(0);
});

test("exports one note per concept into a Harkback folder", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  await lookUpLora(context);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const written: Record<string, Record<string, string>> = {};
    (window as unknown as { __written: typeof written }).__written = written;
    const folder = (name: string) => ({
      getFileHandle: async (file: string) => ({
        createWritable: async () => {
          let text = "";
          return {
            write: async (chunk: string) => void (text += chunk),
            close: async () => void ((written[name] ??= {})[file] = text),
          };
        },
      }),
    });
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => ({
      getDirectoryHandle: async (name: string) => folder(name),
    });
  });
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await page.locator("[data-hb=export-notes]").click();
  await expect(page.locator("[data-hb=status]")).toContainText("1");
  const written = await page.evaluate(() => (window as unknown as { __written: Record<string, Record<string, string>> }).__written);
  expect(Object.keys(written)).toEqual(["Harkback"]);
  expect(written.Harkback!["LoRA.md"]).toContain("# LoRA");
});
