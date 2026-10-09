import { describe, expect, it } from "vitest";
import { EXPLAIN_LANGUAGES, explainLanguageName, foldAccents, identityKey, Matcher, matcherEntriesFromState, replay } from "../../src";
import { concept } from "../helpers";

describe("accents", () => {
  it("drops accents on Latin and Greek letters only", () => {
    expect(foldAccents("résumé Zürich Straße ά")).toBe("resume Zurich Straße α");
    expect(foldAccents("がぎ 한국어 日本語")).toBe("がぎ 한국어 日本語");
  });

  it("treats a term with and without accents as one", () => {
    expect(identityKey("réseau de neurones")).toBe(identityKey("reseau de neurones"));
    expect(identityKey("Fonction d'activation")).toBe(identityKey("fonction d'activation"));
  });

  it("finds a term in text written with or without accents, also when the accent is a separate mark", () => {
    const m = new Matcher(matcherEntriesFromState(replay([concept(1, "descente de gradient")])));
    expect(m.scan("La descente de gradient converge").map((h) => h.text)).toEqual(["descente de gradient"]);
    expect(m.scan("Ordinary text").length).toBe(0);
    const accented = new Matcher(matcherEntriesFromState(replay([concept(1, "réseau de neurones")])));
    expect(accented.scan("un reseau de neurones").length).toBe(1);
    expect(accented.scan("un réseau de neurones").length).toBe(1);
  });
});

describe("two-character Korean and Japanese names", () => {
  const m = new Matcher(matcherEntriesFromState(replay([concept(1, "학습"), concept(2, "ネコ"), concept(3, "模型"), concept(4, "손실")])));
  it("underlines names of two kana or Hangul but not two Han characters", () => {
    expect(m.scan("모델의 학습과 손실, ネコ, 模型").map((h) => h.text)).toEqual(["학습", "손실", "ネコ"]);
  });
});

describe("explanation languages", () => {
  it("lists each language once and names unknown codes English", () => {
    const codes = EXPLAIN_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(explainLanguageName("ko")).toBe("Korean");
    expect(explainLanguageName("??")).toBe("English");
  });
});
