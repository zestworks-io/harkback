import { describe, expect, it } from "vitest";
import { Matcher, matcherEntriesFromState, prepareText, replay } from "../src";
import { concept } from "./helpers";

const state = replay([
  concept(1, "LoRA", "ml", ["Low-Rank Adaptation", "低秩适配"]),
  concept(2, "LLM"),
  concept(3, "微调"),
]);
const matcher = new Matcher(matcherEntriesFromState(state));
const keys = (text: string) => matcher.scan(text).map((h) => h.key);

describe("prepareText", () => {
  it("folds separators and keeps a map back to the original", () => {
    const p = prepareText("Low-Rank  adap­tation");
    expect(p.text).toBe("low rank adaptation");
    // The folded space maps to the character that follows the separator run.
    expect(p.map[3]).toBe(4);
    expect(p.map[4]).toBe(4);
    expect(p.map[9]).toBe(10);
  });
});

describe("Matcher", () => {
  it("returns hits with original offsets", () => {
    const hits = matcher.scan("We use LoRA here.");
    expect(hits).toEqual([{ key: "LoRA", start: 7, end: 11, text: "LoRA" }]);
  });

  it("is case-sensitive for short names", () => {
    expect(keys("the LoRa radio")).toEqual([]);
  });

  it("requires Latin word boundaries", () => {
    expect(keys("QLoRA is different")).toEqual([]);
  });

  it("matches Latin terms embedded in Chinese text", () => {
    expect(keys("用LoRA微调模型")).toEqual(["LoRA"]);
  });

  it("matches CJK aliases of three or more characters without boundaries, and ignores shorter ones", () => {
    expect(keys("这是低秩适配方法")).toEqual(["低秩适配"]);
    expect(keys("这是微调方法")).toEqual([]);
  });

  it("matches hyphen and space variants and soft hyphens", () => {
    expect(keys("low rank adaptation works")).toEqual(["lowrankadaptation"]);
    expect(keys("Low-Rank Adap­tation works")).toEqual(["lowrankadaptation"]);
  });

  it("accepts a trailing plural s", () => {
    expect(matcher.scan("Many LLMs exist")).toEqual([{ key: "LLM", start: 5, end: 9, text: "LLMs" }]);
    expect(keys("low rank adaptations")).toEqual(["lowrankadaptation"]);
  });

  it("scans 200KB of text against 5000 patterns within one second", () => {
    const entries = Array.from({ length: 5000 }, (_, i) => ({
      pattern: `term${i} concept`,
      key: `k${i}`,
      script: "latin" as const,
      caseKey: null,
    }));
    const big = new Matcher(entries);
    const text = "lorem ipsum term42 concept dolor ".repeat(6500);
    const started = performance.now();
    const hits = big.scan(text);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(hits.length).toBe(6500);
  });
});

describe("Matcher: separators and overlaps", () => {
  it("matches short acronyms written with slashes or dots, keeping case rules", () => {
    const m = new Matcher(matcherEntriesFromState(replay([concept(1, "I/O", "systems"), concept(2, "CI/CD", "systems")])));
    expect(m.scan("disk I/O is slow").map((h) => h.text)).toEqual(["I/O"]);
    expect(m.scan("a CI/CD pipeline").map((h) => h.text)).toEqual(["CI/CD"]);
    expect(m.scan("disk i/o is slow")).toEqual([]);
  });

  it("drops hits contained in a longer hit", () => {
    const m = new Matcher(matcherEntriesFromState(replay([concept(1, "self-attention"), concept(2, "attention")])));
    expect(m.scan("uses self-attention layers").map((h) => h.key)).toEqual(["selfattention"]);
    expect(m.scan("self-attention and attention").map((h) => h.key)).toEqual(["selfattention", "attention"]);
  });
});
