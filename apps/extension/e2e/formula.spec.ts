import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, openArxiv, readEvents, seedSettings, sendToActiveTab, stubSettings, test } from "./harness";
import type { StubReply } from "./stub-server";

const readerUrl = (extensionId: string, src: string) => `chrome-extension://${extensionId}/reader.html?src=${encodeURIComponent(src)}`;

const attentionReply: StubReply = {
  body: [
    "<gist>Each query is compared with every key, and the values are averaged by those weights.</gist>",
    "<symbols>",
    JSON.stringify([
      { tex: "Q", meaning: "queries", source: "page", quote: "Q, K and V are the matrices of queries, keys and values" },
      { tex: "K", meaning: "keys", source: "page", quote: "Q, K and V are the matrices of queries, keys and values" },
      { tex: "V", meaning: "values", source: "page", quote: "Q, K and V are the matrices of queries, keys and values" },
      {
        tex: "d_{k}",
        meaning: "dimension of queries and keys",
        source: "page",
        quote: "Let d_{k} denote the dimension of the queries and keys",
      },
      { tex: "\\mathrm{softmax}", meaning: "turns scores into weights", source: "standard", quote: null },
    ]),
    "</symbols>",
  ].join(""),
};
const symbolReply: StubReply = {
  body: '<gist>d_k is the length of each query and key vector.</gist><symbols>[{"tex":"d_{k}","meaning":"dimension of queries and keys","source":"page","quote":"Let d_{k} denote the dimension of the queries and keys"}]</symbols>',
};

/** Selects the contents of `selector` and presses the explain shortcut. */
async function explainContents(page: Page, sw: Parameters<typeof sendToActiveTab>[0], selector: string): Promise<void> {
  await page.bringToFront();
  await page.locator(selector).first().waitFor();
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(range);
  }, selector);
  await sendToActiveTab(sw, { type: "explain-selection" });
}

/** Selects the PDF text from the span holding `from` to the span holding `to`, on the same line. */
async function explainPdfText(page: Page, sw: Parameters<typeof sendToActiveTab>[0], from: string, to: string): Promise<void> {
  await page.bringToFront();
  await expect(page.locator(".textLayer")).toContainText(to);
  await page.evaluate(
    ({ a, z }) => {
      const spans = [...document.querySelectorAll<HTMLElement>(".textLayer span")];
      const first = spans.find((s) => s.textContent?.includes(a))!;
      const last = spans.find((s) => s.textContent?.includes(z))!;
      const range = document.createRange();
      range.setStart(first.firstChild!, first.textContent!.indexOf(a));
      range.setEnd(last.firstChild!, last.textContent!.indexOf(z) + z.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    },
    { a: from, z: to },
  );
  await sendToActiveTab(sw, { type: "explain-selection" });
}

const encounters = async (sw: Parameters<typeof readEvents>[0]) => (await readEvents(sw)).filter((e) => e.type.startsWith("encounter."));

test("explains a formula on an arXiv page: what it says and a row per symbol, quoted from the page", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply);
  const page = await openArxiv(context, "1706.03762");
  await explainContents(page, sw, "#m-attention");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=formula-gist]")).toContainText("Each query is compared with every key");
  await expect(card.locator("[data-hb=symbol]")).toHaveCount(5);
  await expect(card.locator("[data-hb=formula] math")).toHaveCount(1);

  const prompt = stub.requests[0]!.body.messages.at(-1)!.content;
  expect(prompt).toContain("Formula: <formula>\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}(\\frac{QK^{T}}{\\sqrt{d_{k}}})V</formula>");
  expect(prompt).toContain("Let d_{k} denote the dimension of the queries and keys.");
  expect(prompt).toContain("where Q, K and V are the matrices of queries, keys and values.");
});

test("pointing at a symbol lights it up in the formula, and Show on page marks its sentence", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply);
  const page = await openArxiv(context, "1706.03762");
  await explainContents(page, sw, "#m-attention");
  const row = page.locator("[data-hb=symbol][data-tex='d_{k}']");
  await row.hover();
  await expect(page.locator("[data-hb=formula] .hb-hl")).toHaveCount(1);
  await row.locator("[data-hb=show-evidence]").click();
  await expect(page.locator("[data-hb=evidence-mark]").first()).toBeVisible();
});

test("a symbol has its own card, which leads to the whole formula", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(symbolReply, attentionReply);
  const page = await openArxiv(context, "1706.03762");
  await explainContents(page, sw, "#m-dk");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=formula-gist]")).toContainText("d_k is the length");
  expect(stub.requests[0]!.body.messages.at(-1)!.content).toContain("Selected symbol: d_{k}");
  await card.locator("[data-hb=explain-whole]").click();
  await expect(card.locator("[data-hb=symbol]")).toHaveCount(5);
  expect(stub.requests[1]!.body.messages.at(-1)!.content).not.toContain("Selected symbol");
});

test("a formula's explanation and the questions about it are not recorded", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply, { body: "Because large dot products push softmax into flat regions." });
  const page = await openArxiv(context, "1706.03762");
  await explainContents(page, sw, "#m-attention");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=reexplain]")).toBeVisible();
  await card.locator("[data-hb=followup-open]").click();
  await card.locator("input").fill("Why divide by the square root?");
  await card.locator("input").press("Enter");
  await expect(card).toContainText("flat regions");
  expect(await encounters(sw)).toHaveLength(0);
});

test("prose with a little math in it is still explained as a term", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await openArxiv(context, "1706.03762");
  await explainContents(page, sw, "#p-before");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  expect(stub.requests[0]!.body.messages.at(-1)!.content).not.toContain("<formula>");
});

test("in the PDF reader, a formula of an arXiv paper is read from its HTML version", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply);
  const page = await context.newPage();
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/attention.pdf`));
  await explainPdfText(page, sw, "Attention(Q", "(QKT/dk)V");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=formula-gist]")).toContainText("Each query is compared");
  await expect(card.locator("[data-hb=formula-warning]")).toHaveCount(0);
  await expect(card.locator("[data-hb=formula] math")).toHaveCount(1);
  const prompt = stub.requests[0]!.body.messages.at(-1)!.content;
  expect(prompt).toContain("\\frac{QK^{T}}{\\sqrt{d_{k}}}");
  expect(prompt).toContain("Let d_{k} denote the dimension");
  // The quote is from the HTML version, not this PDF: it is shown, with nothing to scroll to.
  const dk = card.locator("[data-hb=symbol][data-tex='d_{k}']");
  await dk.hover();
  await expect(dk.locator("[data-hb=symbol-quote]")).toBeVisible();
  await expect(card.locator("[data-hb=show-evidence]")).toHaveCount(0);
  expect(await encounters(sw)).toHaveLength(0);
});

test("in the PDF reader, a paper without an HTML version gets a card that says it may be inexact", async ({
  context,
  sw,
  stub,
  extensionId,
}) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push({
    body: "<gist>The loss adds up the negative log-probability of each token.</gist><symbols>[]</symbols>",
  });
  const page = await context.newPage();
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/nohtml.pdf`));
  await explainPdfText(page, sw, "L = -sum", "p(xi)");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=formula-warning]")).toBeVisible();
  await expect(card.locator("[data-hb=formula-gist]")).toContainText("negative log-probability");
  expect(stub.requests[0]!.body.messages.at(-1)!.content).toMatch(/may be garbled/);
});

test("a slow arXiv lookup does not replace a card opened after it", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const page = await context.newPage();
  const html = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/arxiv-1706.03762.html"), "utf8");
  await page.route("https://arxiv.org/html/**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: html }).catch(() => undefined);
  });
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/attention.pdf`));
  await explainPdfText(page, sw, "Attention(Q", "(QKT/dk)V");
  // The card shows at once while the HTML version is fetched.
  await expect(page.locator("[data-hb=card]")).toBeVisible();
  await explainPdfText(page, sw, "We compute", "dot products");
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  await page.waitForTimeout(3500);
  await expect(page.locator("[data-hb=understood]")).toBeVisible();
  await expect(page.locator("[data-hb=formula-gist]")).toHaveCount(0);
  expect(stub.requests).toHaveLength(1);
});

test("Stop while the arXiv version is looked up closes the card and asks nothing", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply);
  const page = await context.newPage();
  const html = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/arxiv-1706.03762.html"), "utf8");
  await page.route("https://arxiv.org/html/**", async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: html }).catch(() => undefined);
  });
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/attention.pdf`));
  await explainPdfText(page, sw, "Attention(Q", "(QKT/dk)V");
  const card = page.locator("[data-hb=card]");
  await card.locator("[data-hb=stop]").click();
  await expect(card).toHaveCount(0);
  await page.waitForTimeout(2500);
  await expect(card).toHaveCount(0);
  expect(stub.requests).toHaveLength(0);
});

test("a formula's card explains it again from another angle", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply, attentionReply);
  const page = await openArxiv(context, "1706.03762");
  await explainContents(page, sw, "#m-attention");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=symbol]")).toHaveCount(5);
  await card.locator("[data-hb=reexplain]").click();
  await expect(card.locator("[data-hb=symbol]")).toHaveCount(5);
  expect(stub.requests).toHaveLength(2);
  expect(stub.requests[1]!.body.messages.at(-1)!.content).toContain("explained again");
  expect(stub.requests[1]!.body.messages.at(-1)!.content).toContain("<formula>");
});

test("in the PDF reader, a new selection replaces the open card at once, and the same one keeps it", async ({
  context,
  sw,
  stub,
  extensionId,
}) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply);
  const page = await context.newPage();
  const html = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/arxiv-1706.03762.html"), "utf8");
  let slow = false;
  await page.route("https://arxiv.org/html/**", async (route) => {
    if (slow) await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: html }).catch(() => undefined);
  });
  await page.goto(readerUrl(extensionId, `${stub.url}/pdf/attention.pdf`));
  await explainPdfText(page, sw, "Attention(Q", "(QKT/dk)V");
  const cards = page.locator("[data-hb=card]");
  await expect(cards.locator("[data-hb=formula-gist]")).toContainText("Each query is compared");

  // The same selection again: the card stays, and nothing more is asked.
  await explainPdfText(page, sw, "Attention(Q", "(QKT/dk)V");
  await page.waitForTimeout(500);
  await expect(cards).toHaveCount(1);
  await expect(cards.locator("[data-hb=formula-gist]")).toContainText("Each query is compared");
  expect(stub.requests).toHaveLength(1);

  // Another selection: the old card goes before the new one is looked up.
  slow = true;
  await explainPdfText(page, sw, "We compute", "dot products");
  await expect(cards).toHaveCount(1);
  await expect(cards.locator("[data-hb=formula-gist]")).toHaveCount(0);
  await expect(page.locator("[data-hb=understood]")).toBeEnabled();
  await expect(cards).toHaveCount(1);
});

test("a formula card's buttons keep clear of the close button", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push(attentionReply);
  const page = await openArxiv(context, "1706.03762");
  await explainContents(page, sw, "#m-attention");
  const card = page.locator("[data-hb=card]");
  await expect(card.locator("[data-hb=reexplain]")).toBeVisible();
  const close = (await card.locator("[data-hb=close]").boundingBox())!;
  for (const button of await card.locator(".hb-footer button").all()) {
    const b = (await button.boundingBox())!;
    const overlaps = b.x < close.x + close.width && close.x < b.x + b.width && b.y < close.y + close.height && close.y < b.y + b.height;
    expect(overlaps, (await button.textContent()) ?? "").toBe(false);
  }
});
