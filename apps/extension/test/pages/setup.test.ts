import { describe, expect, it } from "vitest";
import type { ConnectionResult } from "../../src/lib/models/connection";
import { PRIVACY } from "../../src/lib/pages/privacy";
import { connectionMessage, onboardingSettings } from "../../src/lib/pages/setup";
import { PROVIDERS } from "../../src/lib/models/providers";
import { DEFAULT_SETTINGS } from "../../src/lib/storage/settings";

describe("onboardingSettings", () => {
  const input = {
    language: "en" as const,
    label: "Ollama",
    baseUrl: " http://127.0.0.1:11434/v1 ",
    apiKey: " ",
    model: " qwen3 ",
    provider: "ollama",
  };

  it("adds the model, makes it the default and, when local, the model for sensitive sources", () => {
    const s = onboardingSettings(DEFAULT_SETTINGS, input, new Date("2026-09-25T00:00:00Z"), () => "m1");
    expect(s).toMatchObject({
      onboarded: true,
      consentAt: "2026-09-25T00:00:00.000Z",
      language: "en",
      defaultModelId: "m1",
      localModelId: "m1",
    });
    expect(s.models).toEqual([
      { id: "m1", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "qwen3", provider: "ollama" },
    ]);
  });

  it("running setup again updates the same model instead of adding a copy", () => {
    const first = onboardingSettings(DEFAULT_SETTINGS, input, new Date(), () => "m1");
    const again = onboardingSettings(first, { ...input, label: "Local Ollama" }, new Date(), () => "m9");
    expect(again.models).toEqual([expect.objectContaining({ id: "m1", label: "Local Ollama" })]);
    expect(again.defaultModelId).toBe("m1");
    expect(again.localModelId).toBe("m1");
  });

  it("does not use a remote model for sensitive sources", () => {
    const s = onboardingSettings(DEFAULT_SETTINGS, { ...input, baseUrl: "https://api.openai.com/v1", apiKey: "k" }, new Date(), () => "m2");
    expect(s.localModelId).toBeNull();
    expect(s.defaultModelId).toBe("m2");
  });
});

describe("connectionMessage", () => {
  it("explains how to allow the extension origin in Ollama", () => {
    const text = connectionMessage("zh", { kind: "origin_blocked" }, "chrome-extension://abc");
    expect(text).toContain("OLLAMA_ORIGINS");
    expect(text).toContain('launchctl setenv OLLAMA_ORIGINS "chrome-extension://abc"');
  });

  it("covers every result", () => {
    const results: ConnectionResult[] = [
      { kind: "ok", models: ["a"] },
      { kind: "auth" },
      { kind: "insecure" },
      { kind: "http", status: 500 },
      { kind: "unreachable" },
    ];
    for (const r of results) {
      expect(connectionMessage("en", r, "chrome-extension://abc").length).toBeGreaterThan(0);
    }
  });
});

describe("page content", () => {
  it("offers the model providers and privacy notes in both languages", () => {
    expect(PROVIDERS.map((t) => t.id)).toEqual(["ollama", "chrome-ai", "openai", "anthropic", "gemini", "grok", "openrouter", "custom"]);
    expect(PRIVACY.zh.length).toBe(PRIVACY.en.length);
    expect(PRIVACY.zh.join("")).toContain("未加密");
  });
});
