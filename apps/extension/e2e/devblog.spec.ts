import type { BrowserContext, Page } from "@playwright/test";
import { expect, openArxiv, seedSettings, selectAndExplain, sendToActiveTab, stubSettings, test } from "./harness";
import type { StubServer } from "./stub-server";

const POST = "https://example.github.io/posts/fine-tuning/";

async function lookUpLoraThenOpenPost(context: BrowserContext, stub: StubServer, sw: Parameters<typeof seedSettings>[0]): Promise<Page> {
  await seedSettings(sw, stubSettings(stub.url, { sites: [{ pattern: "example.github.io", autoScan: true }] }));
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();
  // The content script is registered by the settings change; give it a moment on the first visit.
  let post!: Page;
  await expect(async () => {
    post = await context.newPage();
    await post.goto(POST);
    await expect(post.locator("[data-hb=mark]")).toHaveCount(1, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  return post;
}

test("a term in a code sample is not underlined; the same term in the prose after it is", async ({ context, sw, stub }) => {
  const post = await lookUpLoraThenOpenPost(context, stub, sw);
  const mark = (await post.locator("[data-hb=mark]").boundingBox())!;
  const inline = (await post.locator("#i-lora").boundingBox())!;
  const code = (await post.locator("#code-config").boundingBox())!;
  expect(mark.y).toBeGreaterThan(code.y + code.height);
  expect(mark.x).toBeCloseTo(inline.x, 0);
  expect(mark.y).toBeGreaterThanOrEqual(inline.y);
  expect(mark.y).toBeLessThanOrEqual(inline.y + inline.height);

  // A name in the code can still be selected and explained.
  const button = post.locator("[data-hb=explain-button]");
  await post.locator("#k-peft").dblclick();
  expect(await post.evaluate(() => getSelection()?.toString())).toBe("peft");
  await button.click();
  await expect(post.locator("[data-hb=understood]")).toBeEnabled();
});

test("the page preview sends the prose without the code samples", async ({ context, sw, stub }) => {
  const post = await lookUpLoraThenOpenPost(context, stub, sw);
  await post.bringToFront();
  await sendToActiveTab(sw, { type: "preview" });
  const before = stub.requests.length;
  stub.queue.push({ body: "<terms>\nLoRA\n</terms>" });
  await post.locator("[data-hb=preview] [data-hb=preview-scan]").click();
  await expect.poll(() => stub.requests.length).toBe(before + 1);
  const sent = stub.requests.at(-1)!.body.messages[1]!.content;
  expect(sent).toContain("The LoRA adapters add only a few million trainable parameters");
  expect(sent).not.toContain("CodeOnlyTerm");
  expect(sent).not.toContain("get_peft_model");
});
