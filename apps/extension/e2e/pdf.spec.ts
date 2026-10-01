import type { Page } from "@playwright/test";
import { eventsOf, expect, openArxiv, seedSettings, selectAndExplain, stubSettings, test } from "./harness";

const readerUrl = (extensionId: string, src: string) => `chrome-extension://${extensionId}/reader.html?src=${encodeURIComponent(src)}`;

/** Viewport position of the middle of a word in the reader's text layer. */
async function centerOf(page: Page, word: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((w) => {
    const walker = document.createTreeWalker(document.getElementById("pages")!, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const i = node.data.indexOf(w);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + w.length);
      const r = range.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  }, word);
  if (!at) throw new Error(`"${word}" is not in the text layer`);
  return at;
}

test("explains a term in a PDF with the paragraph around it and records the PDF as the source", async ({
  context,
  sw,
  stub,
  extensionId,
}) => {
  await seedSettings(sw, stubSettings(stub.url));
  const src = `${stub.url}/pdf/paper.pdf`;
  const page = await context.newPage();
  await page.goto(readerUrl(extensionId, src));
  // The title and the two section headings.
  await expect(page.locator(".textLayer h2")).toHaveCount(3);

  const button = page.locator("[data-hb=explain-button]");
  await expect(async () => {
    const { x, y } = await centerOf(page, "LoRA");
    await page.mouse.dblclick(x, y);
    await expect(button).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await button.click();
  await expect(page.locator("[data-hb=explanation]")).toHaveText("LoRA 是一个测试解释。");

  // The lines of the paragraph reached the model as one paragraph, and the broken word was mended.
  const sent = stub.requests[0]!.body.messages.map((m) => m.content).join("\n");
  expect(sent).toContain("freezes the pretrained weights and injects small trainable matrices into every layer");
  await expect.poll(async () => (await eventsOf(sw, "encounter.created")).length).toBe(1);
  const events = await eventsOf(sw, "encounter.created");
  const encounter = events[0]!.payload as { locator: { exact: string; section?: string }; source_id: string };
  expect(encounter.source_id).toBe(`url:${src}`);
  expect(encounter.locator).toMatchObject({ exact: "LoRA", section: "1 Introduction" });
  const seen = (await eventsOf(sw, "source.seen")).map((e) => e.payload as { source_id: string; title: string; ids: { url?: string } });
  expect(seen.find((s) => s.source_id === `url:${src}`)).toMatchObject({ title: "Adapters for Small Language Models", ids: { url: src } });
});

test("draws the pages and reads the text of pages that are not on screen yet", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await context.newPage();
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/paper.pdf`));
  await expect(page.locator(".hb-page")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(".hb-page canvas")!;
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        return data.some((v, i) => i % 4 !== 3 && v < 128);
      }),
    )
    .toBe(true);
  await expect(page.locator(".hb-page[data-page='2'] .textLayer")).toContainText("Each adapted layer adds a product");
});

test("shows a reunion in a PDF for a term explained on another paper", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();

  const page = await context.newPage();
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/paper.pdf`));
  await expect(page.locator("[data-hb=mark]")).toHaveCount(1);
});

test("keeps the columns of a page apart", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await context.newPage();
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/columns.pdf`));
  const blocks = page.locator(".textLayer p");
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(0)).toHaveText(/^The left column opens the page and explains attention.*without any detours\.$/);
  await expect(blocks.nth(2)).toHaveText(/^The right column continues after the left one/);
  await expect(blocks.nth(2)).toContainText("feed-forward block");
});

test("says why a PDF could not be opened", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url, { language: "en" }));
  const gone = await context.newPage();
  await gone.goto(readerUrl(extensionId, `${stub.url}/pdf/missing.pdf`));
  await expect(gone.locator("#notice")).toContainText("Could not download this PDF");

  const local = await context.newPage();
  await local.goto(readerUrl(extensionId, "file:///nonexistent/paper.pdf"));
  await expect(local.locator("#notice")).toContainText("Allow access to file URLs");

  const none = await context.newPage();
  await none.goto(readerUrl(extensionId, "javascript:alert(1)"));
  await expect(none.locator("#notice")).toContainText("No PDF was given");
});
