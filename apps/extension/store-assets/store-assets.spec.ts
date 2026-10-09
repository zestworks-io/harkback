import type { Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, openArxiv, seedSettings, selectAndExplain, stubSettings, test } from "../e2e/harness";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../store/assets");
const SIZE = { width: 1280, height: 800 };

const EXPLANATION =
  "LoRA (Low-Rank Adaptation) fine-tunes a large model by freezing its weights and training only small low-rank matrices added to each layer, so far fewer parameters need to be updated.";
const REPLY = [
  `<explanation>${EXPLANATION}</explanation>`,
  "<evidence>We apply LoRA to the attention weights of the Transformer.</evidence>",
  `<card>${JSON.stringify({
    match: null,
    canonical: "Low-Rank Adaptation",
    aliases: ["LoRA"],
    domain: "ml",
    broader: ["Parameter-efficient fine-tuning"],
    variants: ["QLoRA"],
    prerequisites: ["Matrix rank", "Fine-tuning"],
    confidence: { broader: 0.9, variants: 0.8, prerequisites: 0.8 },
  })}</card>`,
].join("\n");

/** The test fixtures are bare HTML; give them the look of a paper so the screenshots read well. */
async function styleAsPaper(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `body{background:#fff;color:#1d1d1f;font:19px/1.7 Charter,"Iowan Old Style",Georgia,serif;margin:0}
      .ltx_page_navbar,.ltx_page_footer{display:none}
      .ltx_document{max-width:700px;margin:0 auto;padding:56px 24px}
      h1{font-size:34px;line-height:1.25;margin:0 0 24px}h2{font-size:23px;margin-top:36px}h6{font-size:16px;margin:24px 0 4px}`,
  });
}

test("store screenshots", async ({ context, sw, stub, extensionId }) => {
  mkdirSync(out, { recursive: true });
  const shot = (page: Page, name: string) => page.screenshot({ path: path.join(out, name) });

  await seedSettings(sw, stubSettings(stub.url, { language: "en" }));
  const first = await openArxiv(context, "2106.09685");
  await first.setViewportSize(SIZE);
  await styleAsPaper(first);
  stub.queue.push({ body: REPLY, chunks: 6, delayMs: 5 });
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();
  await first.waitForTimeout(400);
  await shot(first, "1-explain.png");
  await first.locator("[data-hb=understood]").click();

  const second = await openArxiv(context, "2305.14314");
  await second.setViewportSize(SIZE);
  await styleAsPaper(second);
  await expect(second.locator("[data-hb=mark]")).toHaveCount(1);
  const box = (await second.locator("#t-lora").boundingBox())!;
  await second.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(second.locator("[data-hb=reunion-card]")).toBeVisible();
  await second.waitForTimeout(400);
  await shot(second, "2-reunion.png");

  const library = await context.newPage();
  await library.setViewportSize(SIZE);
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(library.locator("[data-hb=entry]").first()).toBeVisible();
  await shot(library, "3-history.png");

  // Settings as a user would see them, not the stub the flows above ran against.
  await seedSettings(
    sw,
    stubSettings(stub.url, {
      language: "en",
      models: [
        { id: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "qwen3", provider: "ollama" },
        {
          id: "claude",
          label: "Anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          apiKey: "",
          model: "claude-sonnet-5-5",
          provider: "anthropic",
        },
      ],
      defaultModelId: "claude",
      localModelId: "ollama",
      sites: [{ pattern: "internal.example.com", sensitive: true }],
    }),
  );
  const options = await context.newPage();
  await options.setViewportSize(SIZE);
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator("[data-hb=model-row]")).toHaveCount(2);
  await shot(options, "4-settings.png");

  const onboarding = await context.newPage();
  await onboarding.setViewportSize(SIZE);
  await onboarding.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await onboarding.locator("[data-hb=language]").selectOption("en");
  await onboarding.locator("[data-hb=next]").click();
  await onboarding.waitForTimeout(300);
  await shot(onboarding, "5-privacy.png");
  await onboarding.locator("[data-hb=consent]").check();
  await onboarding.locator("[data-hb=next]").click();
  await onboarding.waitForTimeout(300);
  await shot(onboarding, "6-model.png");
});

const TILE = (w: number, h: number, scale: number) => `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:${w}px;height:${h}px;background:#f6f7f5;color:#1c2433;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 ${48 * scale}px;gap:${14 * scale}px;overflow:hidden}
  .brand{display:flex;align-items:center;gap:${12 * scale}px;font-weight:650;font-size:${28 * scale}px;letter-spacing:-.01em}
  .brand img{width:${44 * scale}px;height:${44 * scale}px;border-radius:${10 * scale}px}
  p{font:${22 * scale}px/1.4 Charter,"Iowan Old Style",Georgia,serif;max-width:${w - 96 * scale}px}
  .term{background:rgba(46,75,214,.1);border-radius:2px;text-decoration:underline dashed 2px #2e4bd6;text-underline-offset:${4 * scale}px}
</style>
<div class="brand"><img src="ICON" alt="">Harkback</div>
<p>Explain terms while you read. Remember what you understood. Get it back when you meet <span class="term">the term</span> again.</p>`;

test("promo tiles", async ({ context }) => {
  mkdirSync(out, { recursive: true });
  const icon = `data:image/png;base64,${readFileSync(path.resolve(here, "../public/icons/128.png")).toString("base64")}`;
  for (const [name, w, h, scale] of [
    ["promo-small-440x280.png", 440, 280, 0.8],
    ["promo-marquee-1400x560.png", 1400, 560, 1.7],
  ] as const) {
    const page = await context.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(TILE(w, h, scale).replace("ICON", icon));
    await page.screenshot({ path: path.join(out, name) });
  }
});
