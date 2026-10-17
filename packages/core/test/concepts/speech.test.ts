import { describe, expect, it } from "vitest";
import { boundedDistance, caselessOk, hasNoCase, joinSpelledLetters, Matcher, matcherEntriesFromState, replay, soundex } from "../../src";
import { concept } from "../helpers";

const matcher = (...names: string[]) => new Matcher(matcherEntriesFromState(replay(names.map((n, i) => concept(i + 1, n)))));
const found = (m: Matcher, line: string, speech = true) => m.scan(line, { speech }).map((h) => h.text);

describe("names in automatic captions", () => {
  it("reads a short name matched by case on a line that has no case", () => {
    const m = matcher("LoRA", "GPT", "SET");
    expect(found(m, "so we fine tune it with lora and gpt")).toEqual(["lora", "gpt"]);
    // A line with case keeps the rule, and a frequent word is never taken for a name.
    expect(found(m, "So we use lora here")).toEqual([]);
    expect(found(m, "the training set is small")).toEqual([]);
    expect(found(m, "so we fine tune it with lora", false)).toEqual([]);
  });

  it("joins letters spelled out one by one", () => {
    const m = matcher("RLHF", "GPT");
    expect(found(m, "then r l h f aligns it")).toEqual(["r l h f"]);
    expect(found(m, "a g.p.t. model")).toEqual(["g.p.t"]);
  });

  it("matches a long name heard slightly wrong, and a split or joined word", () => {
    const m = matcher("quantization", "fine-tuning", "low-rank adaptation");
    expect(found(m, "after quantisation the model")).toEqual(["quantisation"]);
    expect(found(m, "with finetuning it")).toEqual(["finetuning"]);
    expect(found(m, "low rank adaption of")).toEqual(["low rank adaption"]);
    expect(found(m, "quantity is not it")).toEqual([]);
  });

  it("matches a short name heard as a word that sounds the same", () => {
    const m = matcher("LoRA", "QLoRA");
    expect(found(m, "we train laura adapters")).toEqual(["laura"]);
    expect(found(m, "we train lower layers")).toEqual([]);
    expect(found(m, "We train Laura adapters")).toEqual([]);
  });

  it("does not find a name twice when it is also matched exactly", () => {
    const m = matcher("quantization");
    expect(found(m, "quantization quantization")).toEqual(["quantization", "quantization"]);
  });
});

describe("speech helpers", () => {
  it("codes words by sound", () => {
    expect(soundex("Robert")).toBe("R163");
    expect(soundex("Rupert")).toBe("R163");
    expect(soundex("Ashcraft")).toBe("A261");
    expect(soundex("lora")).toBe(soundex("laura"));
  });

  it("counts edits with transpositions, and stops early", () => {
    expect(boundedDistance("quantization", "quantisation", 2)).toBe(1);
    expect(boundedDistance("adaption", "adaptation", 2)).toBe(2);
    expect(boundedDistance("form", "from", 1)).toBe(1);
    expect(boundedDistance("abc", "xyzxyz", 1)).toBe(2);
  });

  it("knows when case says nothing, and which short names may ignore it", () => {
    expect(hasNoCase("so we use lora")).toBe(true);
    expect(hasNoCase("So we use lora")).toBe(false);
    expect(hasNoCase("12 34")).toBe(false);
    expect(caselessOk("LoRA")).toBe(true);
    expect(caselessOk("SET")).toBe(false);
    expect(caselessOk("AI")).toBe(false);
  });

  it("joins only runs of single letters", () => {
    expect(joinSpelledLetters("use r l h f now").text).toBe("use rlhf now");
    expect(joinSpelledLetters("a g.p.t. model").text).toBe("a gpt model");
    expect(joinSpelledLetters("a g p t model").text).toBe("a gpt model");
    expect(joinSpelledLetters("plan a b").text).toBe("plan a b");
    expect(joinSpelledLetters("a cat").text).toBe("a cat");
  });
});
