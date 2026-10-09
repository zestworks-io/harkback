import { describe, expect, it } from "vitest";
import { routeCheck } from "../../src/lib/review/review-check";
import { withDefaults } from "../../src/lib/storage/settings";
import { world } from "../helpers";

const local = { id: "l", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "m", provider: "custom" };
const remote = { id: "r", label: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "gpt", provider: "openai" };

function scenario(sensitivity: "normal" | "sensitive" = "normal", url?: string) {
  const w = world();
  w.source("s1", sensitivity, "Paper", url ? { url } : {});
  const c = w.concept("LoRA");
  w.encounter(c, "s1", "Adds two small matrices.");
  return { state: w.state(), c };
}

describe("routeCheck", () => {
  it("picks the default model and says whether it is remote, with the stored explanation to send", () => {
    const { state, c } = scenario();
    const settings = withDefaults({ models: [remote], defaultModelId: "r" });
    expect(routeCheck(settings, state, c)).toMatchObject({
      kind: "ok",
      remote: true,
      sensitive: false,
      term: "LoRA",
      explanation: "Adds two small matrices.",
      model: { id: "r" },
    });
    expect(routeCheck(withDefaults({ models: [local], defaultModelId: "l" }), state, c)).toMatchObject({ kind: "ok", remote: false });
  });

  it("offers nothing when the check is turned off", () => {
    const { state, c } = scenario();
    const settings = withDefaults({ models: [remote], defaultModelId: "r", review: { modelCheck: false } });
    expect(routeCheck(settings, state, c)).toEqual({ kind: "error", code: "internal" });
  });

  it("explains that a model is missing", () => {
    const { state, c } = scenario();
    expect(routeCheck(withDefaults({}), state, c)).toEqual({ kind: "error", code: "no_model" });
  });

  it("sends a sensitive source to a local model only, and never to a remote one", () => {
    const { state, c } = scenario("sensitive");
    const onlyRemote = withDefaults({ models: [remote], defaultModelId: "r" });
    expect(routeCheck(onlyRemote, state, c)).toEqual({ kind: "error", code: "needs_local_model" });
    const both = withDefaults({ models: [remote, local], defaultModelId: "r", localModelId: "l" });
    expect(routeCheck(both, state, c)).toMatchObject({ kind: "ok", remote: false, sensitive: true, model: { id: "l" } });
  });

  it("treats a source on a sensitive site rule as sensitive even if it was recorded before the rule", () => {
    const { state, c } = scenario("normal", "https://wiki.corp.com/page");
    const settings = withDefaults({ models: [remote], defaultModelId: "r", sites: [{ pattern: "wiki.corp.com", sensitive: true }] });
    expect(routeCheck(settings, state, c)).toEqual({ kind: "error", code: "needs_local_model" });
  });

  it("treats an issue as sensitive when its repository was marked sensitive after the issue was recorded", () => {
    const w = world();
    w.source("github:acme/secret#4", "normal", "Issue");
    const c = w.concept("LoRA");
    w.encounter(c, "github:acme/secret#4", "Adds two small matrices.");
    w.source("github:acme/secret", "sensitive", "Repo", {}, true);
    const onlyRemote = withDefaults({ models: [remote], defaultModelId: "r" });
    expect(routeCheck(onlyRemote, w.state(), c)).toEqual({ kind: "error", code: "needs_local_model" });
  });

  it("reports an unknown concept", () => {
    const { state } = scenario();
    expect(routeCheck(withDefaults({ models: [local], defaultModelId: "l" }), state, "missing")).toEqual({
      kind: "error",
      code: "expired",
    });
  });
});
