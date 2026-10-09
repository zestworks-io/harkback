import { DAY_MS } from "@harkback/core";
import type { Action } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import { classifyTerms, routePreview, storedExplanation } from "../../src/lib/explain/preview";
import { withDefaults } from "../../src/lib/storage/settings";
import { world } from "../helpers";

const T0 = Date.UTC(2026, 8, 1);
const local = { id: "l", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "m", provider: "custom" };
const remote = { id: "r", label: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "gpt", provider: "openai" };

function setup() {
  const w = world(T0);
  w.source("s1", "normal", "Paper One");
  const studied = (name: string, action?: Action, aliases: string[] = []) => {
    const id = w.concept(name, aliases);
    const e = w.encounter(id, "s1", `${name} explained`);
    if (action) w.events.push(w.f.make("encounter.action", { encounter_id: e, action }));
    return id;
  };
  return { w, studied };
}

const statusOf = (terms: { term: string; status: string }[]) => Object.fromEntries(terms.map((t) => [t.term, t.status]));

describe("classifyTerms", () => {
  it("sorts the terms of a page by what the reader knows", () => {
    const { w, studied } = setup();
    studied("LoRA", "review_again");
    studied("Attention", "review_hard");
    studied("Softmax", "review_good");
    const terms = classifyTerms(w.state(), ["LoRA", "Attention", "Softmax", "Flash attention"], T0 + DAY_MS);
    expect(statusOf(terms)).toEqual({ LoRA: "confused", Attention: "rusty", Softmax: "understood", "Flash attention": "new" });
  });

  it("calls a term rusty once it is due for review, even if it was understood", () => {
    const { w, studied } = setup();
    studied("Softmax", "review_good");
    expect(statusOf(classifyTerms(w.state(), ["Softmax"], T0 + DAY_MS))).toEqual({ Softmax: "understood" });
    expect(statusOf(classifyTerms(w.state(), ["Softmax"], T0 + 400 * DAY_MS))).toEqual({ Softmax: "rusty" });
  });

  it("matches by alias, lists a concept once and shows its own name", () => {
    const { w, studied } = setup();
    const id = studied("Low-Rank Adaptation", "review_again", ["LoRA"]);
    const terms = classifyTerms(w.state(), ["LoRA", "Low-Rank Adaptation"], T0);
    expect(terms).toEqual([{ term: "LoRA", conceptId: id, name: "Low-Rank Adaptation", status: "confused" }]);
  });

  it("does not take a merely similar name for the same term, and treats a never-explained one as new", () => {
    const { w, studied } = setup();
    studied("LoRA", "review_good");
    const placeholder = w.concept("Matrix rank");
    w.events.push(
      w.f.make("edge.proposed", {
        from: placeholder,
        to: studied("Fine-tuning"),
        rel: "prerequisite",
        source: "llm_explain",
        confidence: 0.8,
        evidence: {},
      }),
    );
    const terms = classifyTerms(w.state(), ["QLoRA", "Matrix rank"], T0);
    expect(statusOf(terms)).toEqual({ QLoRA: "new", "Matrix rank": "new" });
    expect(terms.every((t) => t.conceptId === null)).toBe(true);
  });

  it("leaves out muted concepts", () => {
    const { w, studied } = setup();
    const id = studied("Softmax", "review_again");
    w.events.push(w.f.make("concept.muted", { concept_id: id }));
    expect(classifyTerms(w.state(), ["Softmax"], T0)).toEqual([]);
  });
});

describe("storedExplanation", () => {
  it("returns the latest explanation, and nothing for a concept never explained", () => {
    const { w, studied } = setup();
    const id = studied("LoRA");
    expect(storedExplanation(w.state(), id)).toBe("LoRA explained");
    expect(storedExplanation(w.state(), w.concept("Unknown"))).toBeNull();
    expect(storedExplanation(w.state(), "missing")).toBeNull();
  });
});

describe("routePreview", () => {
  const url = "https://arxiv.org/abs/1";

  it("uses the model the settings choose and says whether it is remote", () => {
    const { w } = setup();
    expect(routePreview(withDefaults({ models: [remote], defaultModelId: "r" }), w.state(), url, "s1")).toMatchObject({
      kind: "ok",
      remote: true,
      sensitive: false,
    });
    expect(routePreview(withDefaults({ models: [local], defaultModelId: "l" }), w.state(), url, "s1")).toMatchObject({
      kind: "ok",
      remote: false,
    });
  });

  it("keeps a page that was marked sensitive, or matches a sensitive site rule, away from a remote model", () => {
    const { w } = setup();
    w.source("s2", "sensitive", "Private");
    const settings = withDefaults({ models: [remote], defaultModelId: "r" });
    expect(routePreview(settings, w.state(), url, "s2")).toEqual({ kind: "error", code: "needs_local_model" });
    const byRule = withDefaults({ models: [remote], defaultModelId: "r", sites: [{ pattern: "arxiv.org", sensitive: true }] });
    expect(routePreview(byRule, w.state(), url, "s1")).toEqual({ kind: "error", code: "needs_local_model" });
    const both = withDefaults({
      models: [remote, local],
      defaultModelId: "r",
      localModelId: "l",
      sites: [{ pattern: "arxiv.org", sensitive: true }],
    });
    expect(routePreview(both, w.state(), url, "s1")).toMatchObject({ kind: "ok", remote: false, sensitive: true });
  });

  it("does not choose a model for a page that looks private until the reader has chosen", () => {
    const { w } = setup();
    const settings = withDefaults({ models: [remote, local], defaultModelId: "r", localModelId: "l" });
    const hint = { privacy: "likely-private" as const };
    expect(routePreview(settings, w.state(), url, "s1", hint)).toEqual({ kind: "error", code: "needs_choice" });
    expect(routePreview(settings, w.state(), url, "s1", { ...hint, choice: "local" })).toMatchObject({
      kind: "ok",
      remote: false,
      sensitive: true,
    });
    expect(routePreview(settings, w.state(), url, "s1", { ...hint, choice: "anyway" })).toMatchObject({ kind: "ok", remote: true });
  });

  it("refuses a disabled site and a missing model", () => {
    const { w } = setup();
    expect(
      routePreview(
        withDefaults({ models: [local], defaultModelId: "l", sites: [{ pattern: "arxiv.org", disabled: true }] }),
        w.state(),
        url,
        "s1",
      ),
    ).toEqual({
      kind: "error",
      code: "site_disabled",
    });
    expect(routePreview(withDefaults({}), w.state(), url, "s1")).toEqual({ kind: "error", code: "no_model" });
  });
});
