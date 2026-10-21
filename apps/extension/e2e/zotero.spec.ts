import { fakeZotero } from "../test/zotero/fake";
import { eventsOf, expect, seedSettings, stubSettings, test } from "./harness";

test("imports the terms highlighted in Zotero and shows them in History", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url, { language: "en" }));
  // api.zotero.org, answered from the fixtures with the headers the service sends.
  const zotero = fakeZotero();
  await context.route("https://api.zotero.org/**", async (route) => {
    const request = route.request();
    const res = await zotero.fetch(request.url(), { headers: await request.allHeaders() });
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#data`);
  await page.locator("[data-hb=zotero-key]").fill("P9NiFoyLeZu2bZNvvuQPDWsd");
  await page.locator("[data-hb=zotero-find]").click();
  await expect(page.locator("[data-hb=zotero-status]")).toHaveText("Terms found: 7. Longer highlights left out: 1.");
  expect(zotero.calls.map((c) => c.headers["zotero-api-key"])).toEqual(zotero.calls.map(() => "P9NiFoyLeZu2bZNvvuQPDWsd"));

  await page.locator("[data-hb=zotero-import]").click();
  await expect(page.locator("[data-hb=zotero-status]")).toHaveText("Look-ups imported: 7.");
  const created = await eventsOf(sw, "encounter.created");
  expect(created.map((e) => e.payload!.selection).sort()).toEqual(
    ["LoRA", "LoRA", "RLHF", "Transformer", "low-rank adaptation", "visual analytics", "置信区间"].sort(),
  );

  // Found again: nothing new is offered.
  await page.locator("[data-hb=zotero-find]").click();
  await expect(page.locator("[data-hb=zotero-status]")).toHaveText("No new terms in your highlights.");

  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  const lora = library.locator("[data-hb=concept]", { has: library.locator("h2", { hasText: /^LoRA$/ }) });
  const visual = library.locator("[data-hb=concept]", { has: library.locator("h2", { hasText: /^visual analytics$/ }) });
  await expect(visual.locator("[data-hb=entry-note]")).toHaveText("Your note: concepte interessant");
  await expect(lora.locator("[data-hb=not-explained]")).toHaveText(Array(2).fill("Highlighted in Zotero; not explained yet."));

  // Explained afterwards with the reader's model: the sensitive file's term goes to the local one (the stub is local).
  for (let i = 0; i < 7; i++) stub.queue.push({ body: "A short explanation from the model." });
  await library.locator("[data-hb=explain-imported]").click();
  await expect(library.locator("[data-hb=explain-imported-bar]")).toHaveText("Explained: 7.");
  await expect(library.locator("[data-hb=not-explained]")).toHaveCount(0);
  await expect(lora.locator(".explanation")).toHaveText(Array(2).fill("A short explanation from the model."));
  expect((await eventsOf(sw, "encounter.explained")).length).toBe(7);
});
