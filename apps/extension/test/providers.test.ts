import { describe, expect, it } from "vitest";
import { detectApiType, PROVIDERS, providerForAddress } from "../src/lib/providers";
import { apiTypeOf, withDefaults } from "../src/lib/settings";

describe("detectApiType", () => {
  it("decides from the address, not the model name", () => {
    expect(detectApiType("https://api.anthropic.com/v1")).toBe("anthropic");
    expect(detectApiType("https://generativelanguage.googleapis.com/v1beta")).toBe("gemini");
    expect(detectApiType("https://api.x.ai/v1")).toBe("openai");
    expect(detectApiType("https://api.openai.com/v1")).toBe("openai");
    expect(detectApiType("http://127.0.0.1:11434/v1")).toBe("openai");
  });

  it("keeps gateways and Google's OpenAI-compatible endpoint on the OpenAI format", () => {
    expect(detectApiType("https://openrouter.ai/api/v1")).toBe("openai");
    expect(detectApiType("https://llm.company.example/v1")).toBe("openai");
    expect(detectApiType("https://generativelanguage.googleapis.com/v1beta/openai/")).toBe("openai");
    expect(detectApiType("not a url")).toBe("openai");
  });
});

describe("providers", () => {
  it("gives every preset the type its address implies", () => {
    for (const p of PROVIDERS.filter((x) => x.baseUrl)) expect(detectApiType(p.baseUrl)).toBe(p.apiType);
  });

  it("finds the preset of an address, or custom", () => {
    expect(providerForAddress("https://api.x.ai/v1").id).toBe("grok");
    expect(providerForAddress("https://api.anthropic.com/v1").id).toBe("anthropic");
    expect(providerForAddress("https://generativelanguage.googleapis.com/v1beta/openai/").id).toBe("custom");
    expect(providerForAddress("https://llm.company.example/v1").id).toBe("custom");
    expect(providerForAddress("http://127.0.0.1:11434/v1").id).toBe("ollama");
    expect(providerForAddress("http://127.0.0.1:1234/v1").id).toBe("custom");
  });
});

describe("saved models", () => {
  const model = { id: "m", label: "M", baseUrl: "https://api.anthropic.com/v1", apiKey: "k", model: "claude" };

  it("works out the API type of models saved before it existed", () => {
    expect(withDefaults({ models: [model] }).models[0]!.apiType).toBe("anthropic");
    expect(apiTypeOf(model)).toBe("anthropic");
    expect(withDefaults({ models: [{ ...model, baseUrl: "https://api.openai.com/v1" }] }).models[0]!.apiType).toBe("openai");
  });

  it("keeps a type chosen by hand and ignores unknown ones", () => {
    expect(withDefaults({ models: [{ ...model, apiType: "openai" }] }).models[0]!.apiType).toBe("openai");
    expect(withDefaults({ models: [{ ...model, apiType: "cohere" }] }).models[0]!.apiType).toBe("anthropic");
  });
});
