import { describe, expect, it } from "vitest";
import type { ExplainRequestMsg } from "../../src/lib/explain/explain";
import { answerFormula, formulaFollowUpContext, planFormula, type FormulaRequestMsg } from "../../src/lib/explain/formula";
import type { PortOut } from "../../src/lib/messaging/messages";
import { DEFAULT_SETTINGS, type ModelConfig, type Settings } from "../../src/lib/storage/settings";
import { world } from "../helpers";

const remote: ModelConfig = {
  id: "r",
  label: "Remote",
  baseUrl: "https://api.example.com/v1",
  apiKey: "k",
  model: "gpt",
  provider: "custom",
};
const local: ModelConfig = {
  id: "l",
  label: "Ollama",
  baseUrl: "http://127.0.0.1:11434/v1",
  apiKey: "",
  model: "qwen",
  provider: "ollama",
};
const settings = (o: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  models: [remote, local],
  defaultModelId: "r",
  localModelId: "l",
  ...o,
});
const ctx = { url: "https://arxiv.org/html/1706.03762", incognito: false };
const formula: FormulaRequestMsg = { tex: "W_0+BA", definitions: [{ id: "d1", text: "Here W_0 is the pretrained weight matrix." }] };
const req = (o: Partial<ExplainRequestMsg> = {}): ExplainRequestMsg & { formula: FormulaRequestMsg } => ({
  mode: "explain",
  selection: "W_0+BA",
  paragraph: "The update is W_0+BA where the rank is small.",
  paragraphId: "b3",
  section: "2 Method",
  pageTitle: "LoRA",
  abstractFirstSentence: "We propose LoRA.",
  pageText: "The update is W_0+BA where the rank is small.",
  locator: { exact: "W_0+BA", prefix: "The update is", suffix: "where the rank" },
  source: { source_id: "arxiv:1706.03762", ids: { arxiv: "1706.03762" }, title: "LoRA", license: "unknown" },
  formula,
  ...o,
});

describe("planFormula", () => {
  it("sends a sensitive source only to the local model", () => {
    const w = world();
    w.source("arxiv:1706.03762", "sensitive");
    const plan = planFormula(req(), ctx, settings(), w.state());
    expect(plan.kind === "ok" && plan.model.id).toBe("l");
    expect(planFormula(req(), ctx, settings({ localModelId: null }), w.state())).toEqual({ kind: "error", code: "needs_local_model" });
  });

  it("refuses a site that is turned off", () => {
    expect(planFormula(req(), ctx, settings({ sites: [{ pattern: "arxiv.org", disabled: true }] }), world().state())).toEqual({
      kind: "error",
      code: "site_disabled",
    });
  });

  it("refuses an empty formula", () => {
    expect(planFormula(req({ formula: { ...formula, tex: "  " } }), ctx, settings(), world().state())).toEqual({
      kind: "error",
      code: "empty_selection",
    });
  });

  it("builds the formula prompt with the symbol, the mode and the approximate flag", () => {
    const plan = planFormula(
      req({ mode: "reexplain", formula: { ...formula, symbol: "W_0", approximate: true } }),
      ctx,
      settings(),
      world().state(),
    );
    if (plan.kind !== "ok") throw new Error(plan.code);
    expect(plan.formula).toMatchObject({ tex: "W_0+BA", symbol: "W_0", mode: "reexplain", approximate: true, language: "en" });
    expect(plan.messages.at(-1)!.content).toContain("Selected symbol: W_0");
  });
});

describe("answerFormula", () => {
  const raw =
    '<gist>Adds a low-rank update.</gist><symbols>[{"tex":"W_0","meaning":"frozen weights","source":"page","quote":"W_0 is the pretrained weight matrix"}]</symbols>';

  it("streams the gist, posts the result, and finishes without recording", async () => {
    const plan = planFormula(req(), ctx, settings(), world().state());
    if (plan.kind !== "ok") throw new Error(plan.code);
    const posted: PortOut[] = [];
    const result = await answerFormula(plan, {
      stream: async (onDelta) => {
        onDelta("<gist>Adds a low");
        onDelta(raw);
        return raw;
      },
      post: (m) => posted.push(m),
      sensitive: false,
    });
    expect(posted).toEqual([
      { type: "formula_delta", gist: "Adds a low" },
      { type: "formula_delta", gist: "Adds a low-rank update." },
      { type: "formula", result, approximate: false },
      { type: "done", encounterId: null, recorded: false, sensitive: false },
    ]);
    expect(result.symbols[0]).toMatchObject({ tex: "W_0", source: "page" });
  });

  it("fails, posting nothing, when the reply has neither a gist nor a symbol", async () => {
    const plan = planFormula(req(), ctx, settings(), world().state());
    if (plan.kind !== "ok") throw new Error(plan.code);
    const posted: PortOut[] = [];
    const empty = "<symbols>[]</symbols>";
    await expect(answerFormula(plan, { stream: async () => empty, post: (m) => posted.push(m), sensitive: false })).rejects.toMatchObject({
      code: "http",
    });
    expect(posted.filter((m) => m.type === "formula" || m.type === "done")).toEqual([]);
  });

  it("gives follow-up questions the formula and what the card said", () => {
    const text = formulaFollowUpContext({
      gist: "Adds a low-rank update.",
      symbols: [{ tex: "W_0", meaning: "frozen weights", source: "page", quote: null }],
    });
    expect(text).toBe("Adds a low-rank update.\nW_0: frozen weights");
  });
});
