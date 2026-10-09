import { describe, expect, it } from "vitest";
import { PROVIDERS, providerById, providerForAddress } from "../src/lib/providers";
import { apiTypeOf, explainLanguageOf, withDefaults } from "../src/lib/settings";

describe("providers", () => {
  it("gives each provider its wire format", () => {
    expect(PROVIDERS.map((p) => [p.id, p.apiType])).toEqual([
      ["ollama", "openai"],
      ["chrome-ai", "builtin"],
      ["openai", "openai"],
      ["anthropic", "anthropic"],
      ["gemini", "gemini"],
      ["grok", "openai"],
      ["openrouter", "openai"],
      ["custom", "openai"],
    ]);
  });

  it("treats an unknown provider as custom", () => {
    expect(providerById("nope").id).toBe("custom");
    expect(providerById(undefined).id).toBe("custom");
  });

  it("finds the provider of an address, or custom", () => {
    expect(providerForAddress("https://api.x.ai/v1").id).toBe("grok");
    expect(providerForAddress("https://api.anthropic.com/v1").id).toBe("anthropic");
    expect(providerForAddress("https://generativelanguage.googleapis.com/v1beta").id).toBe("gemini");
    expect(providerForAddress("https://generativelanguage.googleapis.com/v1beta/openai/").id).toBe("custom");
    expect(providerForAddress("https://llm.company.example/v1").id).toBe("custom");
    expect(providerForAddress("http://127.0.0.1:11434/v1").id).toBe("ollama");
    expect(providerForAddress("http://127.0.0.1:1234/v1").id).toBe("custom");
  });
});

describe("saved models", () => {
  const model = { id: "m", label: "M", baseUrl: "https://api.anthropic.com/v1", apiKey: "k", model: "claude" };

  it("works out the provider of models saved without one from their address", () => {
    const saved = withDefaults({ models: [model, { ...model, id: "n", baseUrl: "https://api.openai.com/v1" }] }).models;
    expect(saved.map((m) => m.provider)).toEqual(["anthropic", "openai"]);
    expect(apiTypeOf(saved[0]!)).toBe("anthropic");
  });

  it("keeps a saved provider and ignores unknown ones", () => {
    expect(withDefaults({ models: [{ ...model, provider: "custom" }] }).models[0]!.provider).toBe("custom");
    expect(withDefaults({ models: [{ ...model, provider: "cohere" }] }).models[0]!.provider).toBe("anthropic");
  });
});

describe("explanation language", () => {
  it("follows the interface language unless one is chosen, and ignores unknown codes", () => {
    expect(withDefaults({ language: "en" }).explainLanguage).toBe("auto");
    expect(explainLanguageOf(withDefaults({ language: "en" }))).toBe("en");
    expect(explainLanguageOf(withDefaults({ language: "en", explainLanguage: "ja" }))).toBe("ja");
    expect(withDefaults({ explainLanguage: "klingon" }).explainLanguage).toBe("auto");
  });
});
