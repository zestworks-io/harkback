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

  it("reads timeouts and review settings, falling back when they are out of range", () => {
    const s = withDefaults({
      timeouts: { idleSeconds: 45, firstTextSeconds: 5 },
      review: { desiredRetention: 0.85, modelCheck: false },
    });
    expect(s.timeouts).toEqual({ idleSeconds: 45, firstTextSeconds: 120 });
    expect(s.review).toEqual({ desiredRetention: 0.85, modelCheck: false });
    expect(withDefaults({ review: { desiredRetention: 2, modelCheck: "no" } }).review).toEqual({ desiredRetention: 0.9, modelCheck: true });
    expect(
      validateSettings(
        settings({ timeouts: { idleSeconds: 1, firstTextSeconds: 120 }, review: { desiredRetention: 0.5, modelCheck: true } }),
      ),
    ).toEqual(["timeouts.idleSeconds", "review.desiredRetention"]);
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

describe("private network models", () => {
  it("allows plain http to a server on the home network, but still treats it as remote", () => {
    for (const url of [
      "http://192.168.1.20:11434/v1",
      "http://10.0.0.5/v1",
      "http://172.20.1.1/v1",
      "http://100.101.102.103/v1",
      "http://nas.local:11434/v1",
      "http://box.tail1234.ts.net/v1",
      "http://[fd12:3456::1]/v1",
    ]) {
      expect(modelUrlError(url), url).toBeNull();
      expect(isLocalUrl(url), url).toBe(false);
    }
    for (const url of [
      "http://8.8.8.8/v1",
      "http://172.32.0.1/v1",
      "http://192.169.1.1/v1",
      "http://example.com/v1",
      "http://100.128.0.1/v1",
    ]) {
      expect(modelUrlError(url), url).toBe("insecure");
    }
  });

  it("never sends a sensitive source to it", () => {
    const lan = { id: "lan", label: "NAS", baseUrl: "http://192.168.1.20:11434/v1", apiKey: "", model: "m", provider: "ollama" };
    const settings = { ...withDefaults({}), models: [lan], defaultModelId: "lan", localModelId: null };
    expect(chooseModel(settings, { autoScan: false, sensitive: false, disabled: false, modelId: null }, false)).toMatchObject({
      kind: "ok",
      remote: true,
    });
    expect(chooseModel(settings, { autoScan: false, sensitive: true, disabled: false, modelId: "lan" }, true)).toMatchObject({
      kind: "error",
      code: "needs_local_model",
    });
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

  it("lets a more specific rule override its site, on or off", () => {
    const rules = [
      { pattern: "example.com", autoScan: true, sensitive: true },
      { pattern: "https://example.com/public", sensitive: false },
      { pattern: "https://example.com/public/off", autoScan: false, disabled: true },
    ];
    expect(effectiveRule(rules, "https://example.com/private")).toMatchObject({ autoScan: true, sensitive: true });
    expect(effectiveRule(rules, "https://example.com/public/a")).toMatchObject({ autoScan: true, sensitive: false });
    expect(effectiveRule(rules, "https://example.com/public/off/x")).toMatchObject({ autoScan: false, sensitive: false, disabled: true });
  });

  it("matches a URL prefix only at a path boundary", () => {
    const rules = [{ pattern: "https://example.com/docs", sensitive: true }];
    expect(effectiveRule(rules, "https://example.com/docs").sensitive).toBe(true);
    expect(effectiveRule(rules, "https://example.com/docs/a?x=1").sensitive).toBe(true);
    expect(effectiveRule(rules, "https://example.com/docs?x=1").sensitive).toBe(true);
    expect(effectiveRule(rules, "https://example.com/docs-private").sensitive).toBe(false);
    expect(effectiveRule(rules, "https://example.com/docsets/a").sensitive).toBe(false);
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
    expect(isLocalUrl("http://127.0.0.2:8080")).toBe(true);
    expect(isLocalUrl("http://llm.localhost:8080")).toBe(true);
    expect(isLocalUrl("http://127.0.0.300")).toBe(false);
    expect(isLocalUrl("http://notlocalhost.example.com")).toBe(false);
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
