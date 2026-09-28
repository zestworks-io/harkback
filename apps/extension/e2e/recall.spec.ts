import type { Locator } from "@playwright/test";
import { expect, openArxiv, readEvents, seedSettings, selectAndExplain, stubSettings, test } from "./harness";

const card = (o: Record<string, unknown>) =>
  JSON.stringify({
    match: null,
    canonical: "term",
    aliases: [],
    domain: "ml",
    broader: [],
    variants: [],
    prerequisites: [],
    confidence: {},
    ...o,
  });
const reply = (explanation: string, c: Record<string, unknown>) =>
  `<explanation>${explanation}</explanation>\n<evidence>NONE</evidence>\n<card>${card(c)}</card>`;

/** The mark is an underline; the card opens when the pointer is over the text just above it. */
async function hoverText(mark: Locator): Promise<void> {
  const box = (await mark.boundingBox())!;
  await mark.page().mouse.move(box.x + box.width / 2, box.y - 4);
}

test("a variant of what you understood is recalled on a page that only mentions the variant", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push({ body: reply("LoRA 是低秩适配。", { canonical: "LoRA", variants: ["QLoRA"], confidence: { variants: 0.9 } }) });
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-lora");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();
  expect((await readEvents(sw)).filter((e) => e.type === "edge.proposed")).toHaveLength(1);

  const other = await openArxiv(context, "2401.00001");
  const marks = other.locator("[data-hb=mark]");
  await expect(marks).toHaveCount(1);
  await hoverText(marks);
  const hover = other.locator("[data-hb=reunion-card]");
  await expect(hover).toContainText("你没查过「QLoRA」，但 0 天前弄懂了「LoRA」");
  await expect(hover).toContainText("当时的解释：LoRA 是低秩适配。");
});

test("an abbreviation is recalled from the full name and recorded on the same concept", async ({ context, sw, stub }) => {
  await seedSettings(sw, stubSettings(stub.url));
  stub.queue.push({ body: reply("大语言模型。", { canonical: "Large Language Model" }) });
  const first = await openArxiv(context, "2106.09685");
  await selectAndExplain(first, "#t-llm");
  await expect(first.locator("[data-hb=understood]")).toBeEnabled();

  const second = await openArxiv(context, "2305.14314");
  const marks = second.locator("[data-hb=mark]");
  await expect(marks).toHaveCount(1);
  await hoverText(marks);
  await expect(second.locator("[data-hb=reunion-title]")).toContainText("Large Language Model");

  stub.queue.push({ body: reply("LLM 的另一种写法。", { canonical: "LLM" }) });
  await selectAndExplain(second, "#t-llms");
  await expect(second.locator("[data-hb=ask]")).toContainText("「Large Language Model」");
  await second.locator("[data-hb=ask-yes]").click();
  await expect(second.locator("[data-hb=understood]")).toBeEnabled();

  const encounters = (await readEvents(sw)).filter((e) => e.type === "encounter.created");
  expect(encounters).toHaveLength(2);
  expect(encounters[1]!.payload?.concept_id).toBe(encounters[0]!.payload?.concept_id);
  expect((await readEvents(sw)).filter((e) => e.type === "concept.created")).toHaveLength(1);
});

test("asks for access instead of failing when the model address was never allowed", async ({ context, sw, stub }) => {
  // The test build allows 127.0.0.1 only, like a fresh install allows nothing until the reader agrees.
  await seedSettings(
    sw,
    stubSettings(stub.url, {
      models: [{ id: "stub", label: "Stub", baseUrl: `${stub.url.replace("127.0.0.1", "localhost")}/v1`, apiKey: "", model: "stub-model" }],
    }),
  );
  const page = await openArxiv(context, "2106.09685");
  await selectAndExplain(page, "#t-lora");
  await expect(page.locator("[data-hb=error]")).toContainText("还没有允许访问模型地址");
  expect(stub.requests).toHaveLength(0);
});

test("the history page picks up explanations recorded while it was open", async ({ context, sw, stub, extensionId }) => {
  await seedSettings(sw, stubSettings(stub.url));
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(library.locator("[data-hb=empty]")).toBeVisible();

  const paper = await openArxiv(context, "2106.09685");
  await selectAndExplain(paper, "#t-lora");
  await expect(paper.locator("[data-hb=understood]")).toBeEnabled();

  await library.bringToFront();
  await expect(library.locator("[data-hb=concept] h2")).toHaveText(["LoRA"]);
});
