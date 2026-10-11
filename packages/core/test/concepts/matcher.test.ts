import { describe, expect, it } from "vitest";
import { Matcher, matcherEntriesFromState, prepareText, replay } from "../../src";
import { concept } from "../helpers";

const state = replay([concept(1, "LoRA", "ml", ["Low-Rank Adaptation", "低秩适配"]), concept(2, "LLM"), concept(3, "微调")]);
const matcher = new Matcher(matcherEntriesFromState(state));
const keys = (text: string) => matcher.scan(text).map((h) => h.key);

describe("prepareText", () => {
  it("folds separators and keeps a map back to the original", () => {
    const p = prepareText("Low-Rank  adap\u00ADtation");
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
    expect(keys("用LoRA微调模型")).toEqual(["LoRA", "微调"]);
  });

  it("matches CJK aliases of three or more characters without boundaries", () => {
    expect(keys("这是低秩适配方法")).toEqual(["低秩适配"]);
    expect(keys("这是低秩适配器方法")).toEqual(["低秩适配"]);
  });

  it("matches hyphen and space variants and soft hyphens", () => {
    expect(keys("low rank adaptation works")).toEqual(["lowrankadaptation"]);
    expect(keys("Low-Rank Adap\u00ADtation works")).toEqual(["lowrankadaptation"]);
  });

  it("accepts a trailing plural s", () => {
    expect(matcher.scan("Many LLMs exist")).toEqual([{ key: "LLM", start: 5, end: 9, text: "LLMs" }]);
    expect(keys("low rank adaptations")).toEqual(["lowrankadaptation"]);
  });

  it("scans 200KB of text against 5000 patterns within three seconds", () => {
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
    expect(performance.now() - started).toBeLessThan(3000);
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

describe("Matcher with characters outside the BMP", () => {
  it("folds mathematical bold letters and keeps hit offsets on whole characters", () => {
    const m = new Matcher([{ pattern: "LoRA", key: "lora", script: "latin", caseKey: "LoRA" }]);
    const text = "We use 𝐋𝐨𝐑𝐀 here.";
    const hits = m.scan(text);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toBe("𝐋𝐨𝐑𝐀");
    expect(text.slice(hits[0]!.start, hits[0]!.end)).toBe("𝐋𝐨𝐑𝐀");
  });

  it("matches a term right before an emoji", () => {
    const m = new Matcher([{ pattern: "attention", key: "attention", script: "latin", caseKey: null }]);
    const hits = m.scan("attention😀");
    expect(hits.map((h) => h.text)).toEqual(["attention"]);
  });
});

describe("Matcher: Arabic", () => {
  const m = new Matcher(matcherEntriesFromState(replay([concept(1, "الشبكة العصبية"), concept(2, "تعلم")])));
  const texts = (text: string) => m.scan(text).map((h) => h.text);

  it("matches whatever the vowel marks and spelling variants, with offsets in the original text", () => {
    const text = "تعتمد الشَّبَكَةُ العصبيّة على البيانات";
    const hits = m.scan(text);
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.start, hits[0]!.end)).toBe("الشَّبَكَةُ العصبيّة");
    expect(texts("الشبكه العصبيه")).toEqual(["الشبكه العصبيه"]);
  });

  it("accepts the one-letter and article prefixes that attach to a word", () => {
    expect(texts("نستخدم بالشبكة العصبية")).toEqual(["الشبكة العصبية"]);
    expect(texts("والشبكة العصبية مفيدة")).toEqual(["الشبكة العصبية"]);
    expect(texts("ولتعلم الآلة")).toEqual(["تعلم"]);
    expect(texts("بتعلم الآلة")).toEqual(["تعلم"]);
  });

  it("accepts pronoun and plural endings", () => {
    expect(texts("نتائج تعلمها جيدة")).toEqual(["تعلم"]);
    expect(texts("هذه تعلمات")).toEqual(["تعلم"]);
  });

  it("does not match inside a longer word", () => {
    expect(texts("المتعلم الذكي")).toEqual([]);
    expect(texts("يتعلم الطالب")).toEqual([]);
    expect(texts("تعلمت الدرس")).toEqual([]);
    expect(texts("بل تعلم")).toEqual(["تعلم"]);
  });

  it("accepts the article that merges with the preposition ل", () => {
    expect(texts("نستخدم للشبكة العصبية")).toEqual(["لشبكة العصبية"]);
  });

  it("underlines the vowel marks that end a name, and no marks after other scripts", () => {
    const name = new Matcher(matcherEntriesFromState(replay([concept(1, "الشبكة"), concept(2, "LoRA")])));
    const text = "هذه الشبكةُ جيدة";
    const hit = name.scan(text)[0]!;
    expect(text.slice(hit.start, hit.end)).toBe("الشبكةُ");
    const latin = "LoRA\u064E here";
    const lora = name.scan(latin)[0]!;
    expect(latin.slice(lora.start, lora.end)).toBe("LoRA");
  });

  it("matches next to Latin letters and punctuation", () => {
    expect(texts("(تعلم)")).toEqual(["تعلم"]);
    expect(texts("LoRA تعلم LoRA")).toEqual(["تعلم"]);
    expect(texts("التعلم، العميق")).toEqual(["تعلم"]);
  });
});

describe("Matcher: two-character Han names", () => {
  const m = new Matcher(matcherEntriesFromState(replay([concept(1, "微调"), concept(2, "模型"), concept(3, "合并"), concept(4, "損失")])));
  const texts = (text: string) => m.scan(text).map((h) => h.text);

  it("matches them as whole words", () => {
    expect(texts("这是微调方法")).toEqual(["微调"]);
    expect(texts("典型的模型")).toEqual(["模型"]);
    expect(texts("勾配降下法で損失を最小化する")).toEqual(["損失"]);
  });

  it("does not match when the characters belong to different words", () => {
    expect(texts("数据集合并")).toEqual([]);
    expect(texts("数据集合并后")).toEqual([]);
  });

  it("still lets a longer name win over the two-character name inside it", () => {
    const withLong = new Matcher(matcherEntriesFromState(replay([concept(1, "模型"), concept(2, "大模型")])));
    expect(withLong.scan("大模型很强").map((h) => h.text)).toEqual(["大模型"]);
  });

  it("leaves one-character names and names of three or more characters as they were", () => {
    const other = new Matcher(matcherEntriesFromState(replay([concept(1, "梯"), concept(2, "梯度下降")])));
    expect(other.scan("梯度下降的梯子").map((h) => h.text)).toEqual(["梯度下降"]);
    expect(other.scan("不同梯度下降法").map((h) => h.text)).toEqual(["梯度下降"]);
  });

  it("does nothing special for names written with kana or Hangul", () => {
    const k = new Matcher(matcherEntriesFromState(replay([concept(1, "モデル"), concept(2, "학습")])));
    expect(k.scan("このモデルは").map((h) => h.text)).toEqual(["モデル"]);
    expect(k.scan("기계학습이다").map((h) => h.text)).toEqual(["학습"]);
  });
});

describe("Matcher: Han spellings", () => {
  const m = new Matcher(matcherEntriesFromState(replay([concept(1, "神经网络"), concept(3, "机器学习", "ml", ["機器學習"])])));

  it("matches Traditional text for a Simplified name and the other way round", () => {
    expect(m.scan("深度神經網絡").map((h) => h.text)).toEqual(["神經網絡"]);
    const t = new Matcher(matcherEntriesFromState(replay([concept(1, "神經網絡")])));
    expect(t.scan("深度神经网络").map((h) => h.text)).toEqual(["神经网络"]);
  });

  it("does not read hiragana as a katakana name", () => {
    const k = new Matcher(matcherEntriesFromState(replay([concept(1, "ヒト"), concept(2, "グラディエント")])));
    expect(k.scan("ひとはグラディエントを使う").map((h) => h.text)).toEqual(["グラディエント"]);
    expect(k.scan("ヒトのゲノム").map((h) => h.text)).toEqual(["ヒト"]);
  });
});
