import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/lib/rate-limit";
import { chooseModel, isLocalUrl, modelUrlError } from "../src/lib/model-policy";
import { DEFAULT_SETTINGS, validateSettings, withDefaults, type ModelConfig, type Settings } from "../src/lib/settings";
import { effectiveRule, hostPermissionPatterns, normalizePattern, originPattern } from "../src/lib/site-rules";

const remote: ModelConfig = {
  id: "r",
  label: "Remote",
  baseUrl: "https://api.example.com/v1",
  apiKey: "k",
  model: "m",
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
const noRule = { autoScan: false, sensitive: false, disabled: false, modelId: null };

describe("settings", () => {
  it("fills missing fields from defaults and ignores junk", () => {
    const s = withDefaults({ language: "en", rateLimit: { perMinute: 5 }, models: "nope" });
    expect(s.language).toBe("en");
    expect(s.rateLimit).toEqual({ perMinute: 5, perHour: 100 });
    expect(s.models).toEqual([]);
    expect(withDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("drops malformed models, sites and scalar values", () => {
    const s = withDefaults({
      onboarded: "yes",
      models: [{ id: "a", baseUrl: "http://127.0.0.1:1/v1", model: 3 }, { label: "no id" }, null],
      sites: [{ pattern: "a.com", sensitive: true, autoScan: "yes" }, { autoScan: true }],
      rateLimit: { perMinute: "10", perHour: Infinity },
      defaultModelId: 5,
    });
    expect(s.onboarded).toBe(false);
    expect(s.models).toEqual([{ id: "a", label: "", baseUrl: "http://127.0.0.1:1/v1", apiKey: "", model: "", provider: "custom" }]);
    expect(s.sites).toEqual([{ pattern: "a.com", sensitive: true }]);
    expect(s.rateLimit).toEqual(DEFAULT_SETTINGS.rateLimit);
    expect(s.defaultModelId).toBeNull();
  });

  it("reports invalid fields by path", () => {
    const bad = settings({
      models: [{ ...remote, baseUrl: "http://api.example.com/v1" }, local],
      localModelId: "r",
      rateLimit: { perMinute: 0, perHour: 100 },
      reunion: { minGapDays: -1, maxPerPage: 3 },
      sites: [{ pattern: "not a site" }],
    });
    expect(validateSettings(bad)).toEqual([
      "models[0].baseUrl",
      "localModelId",
      "rateLimit.perMinute",
      "reunion.minGapDays",
      "sites[0].pattern",
    ]);
    expect(validateSettings(settings())).toEqual([]);
  });
});

describe("site rules", () => {
  it("normalizes domains and URL prefixes", () => {
    expect(normalizePattern(" *.Example.COM/ ")).toBe("example.com");
    expect(normalizePattern("https://example.com/docs")).toBe("https://example.com/docs");
    expect(normalizePattern("not a site")).toBeNull();
  });

  it("merges every matching rule; the longest pattern wins the model", () => {
    const rules = [
      { pattern: "example.com", autoScan: true },
      { pattern: "https://intra.example.com/secret", sensitive: true, modelId: "l" },
      { pattern: "intra.example.com", modelId: "r" },
    ];
    expect(effectiveRule(rules, "https://intra.example.com/secret/page")).toEqual({
      autoScan: true,
      sensitive: true,
      disabled: false,
      modelId: "l",
    });
    expect(effectiveRule(rules, "https://other.org/")).toEqual(noRule);
    expect(effectiveRule(rules, "not a url")).toEqual(noRule);
  });

  it("builds host permission patterns", () => {
    expect(hostPermissionPatterns("example.com")).toEqual(["*://example.com/*", "*://*.example.com/*"]);
    expect(hostPermissionPatterns("https://intra.example.com/docs")).toEqual(["https://intra.example.com/*"]);
    expect(originPattern("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1/*");
  });
});

describe("routing", () => {
  it("recognizes local model addresses and rejects remote http", () => {
    expect(isLocalUrl("http://localhost:11434/v1")).toBe(true);
    expect(isLocalUrl("http://[::1]:8080")).toBe(true);
    expect(isLocalUrl("https://api.example.com")).toBe(false);
    expect(modelUrlError("http://api.example.com/v1")).toBe("insecure");
    expect(modelUrlError("ftp://x")).toBe("invalid");
    expect(modelUrlError("http://127.0.0.1:11434/v1")).toBeNull();
  });

  it("routes sensitive sources to the local model only", () => {
    expect(chooseModel(settings(), noRule, false)).toEqual({ kind: "ok", model: remote, remote: true });
    expect(chooseModel(settings(), noRule, true)).toEqual({ kind: "ok", model: local, remote: false });
    expect(chooseModel(settings({ localModelId: null }), noRule, true)).toEqual({ kind: "error", code: "needs_local_model" });
    expect(chooseModel(settings(), { ...noRule, sensitive: true, modelId: "r" }, true)).toEqual({
      kind: "error",
      code: "needs_local_model",
    });
    expect(chooseModel(settings({ defaultModelId: null }), noRule, false)).toEqual({ kind: "error", code: "no_model" });
    expect(chooseModel(settings({ models: [{ ...remote, baseUrl: "http://api.example.com" }] }), noRule, false)).toEqual({
      kind: "error",
      code: "insecure_model",
    });
  });
});

describe("RateLimiter", () => {
  it("enforces per-minute and per-hour limits and reports when to retry", () => {
    const rl = new RateLimiter();
    const limits = { perMinute: 2, perHour: 3 };
    expect(rl.tryAcquire(limits, 0).ok).toBe(true);
    expect(rl.tryAcquire(limits, 1000).ok).toBe(true);
    expect(rl.tryAcquire(limits, 2000)).toEqual({ ok: false, retryAfterMs: 58000 });
    expect(rl.tryAcquire(limits, 61000).ok).toBe(true);
    expect(rl.tryAcquire(limits, 125000)).toEqual({ ok: false, retryAfterMs: 3475000 });
  });

  it("restores stamps and drops ones from the future", () => {
    const rl = new RateLimiter();
    rl.load([5000, 1000, 999999]);
    expect(rl.tryAcquire({ perMinute: 10, perHour: 10 }, 6000).ok).toBe(true);
    expect(rl.stamps()).toEqual([1000, 5000, 6000]);
  });
});
