import { describe, expect, it } from "vitest";
import { localizeNames } from "../../src/lib/records/names";

const BLEU = [
  "BLEU",
  "双语评估替补",
  "双语评估替补指标",
  "Bilingual Evaluation Understu",
  "双语评测替补",
  "Bilingual Evaluation Understud",
];

describe("localizeNames", () => {
  it("shows only English names for English, without names cut off while streaming", () => {
    expect(localizeNames("Bilingual Evaluation Understudy", BLEU, "en")).toEqual({
      name: "Bilingual Evaluation Understudy",
      aliases: ["BLEU"],
    });
  });

  it("shows only Chinese names for Chinese and uses one as the title", () => {
    expect(localizeNames("Bilingual Evaluation Understudy", BLEU, "zh")).toEqual({
      name: "双语评估替补",
      aliases: ["双语评估替补指标", "双语评测替补"],
    });
  });

  it("keeps the canonical name when it is in the chosen language", () => {
    expect(localizeNames("低秩适配", ["LoRA", "低秩分解适配"], "zh")).toEqual({ name: "低秩适配", aliases: ["低秩分解适配"] });
  });

  it("falls back to every name when none is in the chosen language", () => {
    expect(localizeNames("LoRA", ["LoRAs"], "zh")).toEqual({ name: "LoRA", aliases: ["LoRAs"] });
    expect(localizeNames("低秩适配", ["低秩"], "en")).toEqual({ name: "低秩适配", aliases: ["低秩"] });
  });

  it("does not drop short abbreviations that another name starts with", () => {
    expect(localizeNames("Large Language Model", ["LLM", "LLMs"], "en").aliases).toEqual(["LLM", "LLMs"]);
  });

  it("picks names by the script of the chosen language", () => {
    const names = ["Gradient Descent", "勾配降下法", "경사 하강법", "Градиентный спуск"];
    expect(localizeNames("Gradient Descent", names, "ja")).toEqual({ name: "勾配降下法", aliases: [] });
    expect(localizeNames("Gradient Descent", names, "ko")).toEqual({ name: "경사 하강법", aliases: [] });
    expect(localizeNames("Gradient Descent", names, "ru")).toEqual({ name: "Градиентный спуск", aliases: [] });
    expect(localizeNames("Gradient Descent", names, "zh-TW").name).toBe("勾配降下法");
    expect(localizeNames("Gradient Descent", names, "es")).toEqual({ name: "Gradient Descent", aliases: [] });
  });
});
