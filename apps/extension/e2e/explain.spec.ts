import type { Page } from "@playwright/test";
import { expect, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test } from "./harness";
import { otherDomainReply } from "./stub-server";

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
  expect(encounter?.payload).toMatchObject({
    selection: "LoRA",
    source_id: "arxiv:2106.09685",
    locator: { exact: "LoRA", section: "1 Introduction" },
  });
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

  stub.queue.push(otherDomainReply("LoRAs"));
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

test("the card in Arabic is right to left and lines up with the end of the selection", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url, { language: "ar" }));
  const page = await openArxiv(context, "2106.09685");
  await explainWord(page, "#t-lora");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=explanation]")).toBeVisible();
  await expect(card).toHaveAttribute("dir", "rtl");
  await expect(card.locator("[data-hb=close]")).toHaveAttribute("aria-label", "إغلاق");

  // The close button is at the left corner in right-to-left, and the card stays inside the window.
  const box = (await card.boundingBox())!;
  const close = (await card.locator("[data-hb=close]").boundingBox())!;
  expect(close.x - box.x).toBeLessThan(box.x + box.width - (close.x + close.width));
  const width = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
});

test("shows the passage an explanation quotes, on the page and from History", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url, { language: "en" }));
  const quoted = "We propose Low-Rank Adaptation, or LoRA, which freezes the pre-trained model weights";
  stub.queue.push({ body: otherDomainReply("LoRA").body!.replace("<evidence>NONE</evidence>", `<evidence>${quoted}</evidence>`) });
  const page = await openArxiv(context, "2106.09685");
  await explainWord(page, "#t-lora");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=tier]")).toHaveText("Defined in source");
  await card.locator("[data-hb=show-evidence]").click();

  // The mark covers the quoted sentence, in the abstract above the selection.
  const mark = page.locator("[data-hb=evidence-mark]").first();
  await expect(mark).toBeVisible();
  const markBox = (await mark.boundingBox())!;
  const sentence = (await page.locator("p.ltx_p", { hasText: "We propose Low-Rank Adaptation" }).boundingBox())!;
  expect(markBox.y).toBeGreaterThanOrEqual(sentence.y - 2);
  expect(markBox.y).toBeLessThan(sentence.y + sentence.height);
  await expect(page.locator("[data-hb=evidence-mark]")).toHaveCount(0, { timeout: 8000 });

  // In a panel that scrolls on its own, the mark follows the text as the panel scrolls and is cut off at the panel's edge.
  await page.evaluate(() => {
    const p = [...document.querySelectorAll("p.ltx_p")].find((el) => el.textContent!.includes("We propose Low-Rank Adaptation"))!;
    (p.parentElement as HTMLElement).style.cssText = "height: 160px; overflow: auto";
  });
  await card.locator("[data-hb=show-evidence]").click();
  await expect(mark).toBeVisible();
  const textTop = () =>
    page.evaluate(() => {
      const p = [...document.querySelectorAll("p.ltx_p")].find((el) => el.textContent!.includes("We propose Low-Rank Adaptation"))!;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent!.indexOf("We propose");
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + 2);
        const panel = p.parentElement!.getBoundingClientRect();
        return { top: range.getBoundingClientRect().top, panelTop: panel.top, panelBottom: panel.bottom };
      }
      throw new Error("text not found");
    });
  await page.waitForTimeout(600); // the smooth scroll to the passage
  await page.evaluate(() => {
    const p = [...document.querySelectorAll("p.ltx_p")].find((el) => el.textContent!.includes("We propose Low-Rank Adaptation"))!;
    p.parentElement!.scrollTop += 24;
  });
  await expect
    .poll(async () => {
      const t = await textTop();
      return Math.abs((await mark.boundingBox())!.y - Math.max(t.top, t.panelTop));
    })
    .toBeLessThan(2);
  const t = await textTop();
  for (const box of await page
    .locator("[data-hb=evidence-mark]")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON())))
    expect(box.y + box.height).toBeLessThanOrEqual(t.panelBottom + 1);

  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  const link = library.locator("[data-hb=evidence-link]");
  await expect(link).toHaveText("Defined in source");
  expect(await link.getAttribute("href")).toBe(
    "https://arxiv.org/html/2106.09685#:~:text=We%20propose%20Low%2DRank%20Adaptation%2C%20or,freezes%20the%20pre%2Dtrained%20model%20weights",
  );
});
