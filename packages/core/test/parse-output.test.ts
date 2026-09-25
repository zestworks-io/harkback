import { describe, expect, it } from "vitest";
import { parseModelOutput, streamingExplanation } from "../src";

const labels = new Map([["c1", "CONCEPT_1"], ["c2", "CONCEPT_2"]]);
const card = (o: Record<string, unknown>) =>
  JSON.stringify({ match: null, canonical: "LoRA", aliases: [], domain: "ml", broader: [], variants: [], prerequisites: [], confidence: {}, ...o });
const out = (c: string, evidence = "NONE") => `<explanation>低秩适配。</explanation>\n<evidence>${evidence}</evidence>\n<card>${c}</card>`;

describe("parseModelOutput", () => {
  it("parses the three blocks and maps the match label", () => {
    const r = parseModelOutput(out(card({ match: "c2" }), "we freeze the weights"), labels);
    expect(r.explanation).toBe("低秩适配。");
    expect(r.evidence).toBe("we freeze the weights");
    expect(r.card?.matchConceptId).toBe("CONCEPT_2");
    expect(r.flags).toEqual([]);
  });

  it("accepts a card wrapped in a json code fence and text outside the tags", () => {
    const r = parseModelOutput(`Sure!\n${out("```json\n" + card({}) + "\n```")}\nHope this helps.`, labels);
    expect(r.card?.canonical).toBe("LoRA");
  });

  it("treats NONE evidence as null", () => {
    expect(parseModelOutput(out(card({})), labels).evidence).toBeNull();
  });

  it("falls back to the whole output when the explanation tag is missing", () => {
    const r = parseModelOutput("LoRA 是一种微调方法。", labels);
    expect(r).toEqual({ explanation: "LoRA 是一种微调方法。", evidence: null, card: null, flags: ["card_missing"] });
  });

  it("flags a malformed card", () => {
    const r = parseModelOutput(out("{not json"), labels);
    expect(r.card).toBeNull();
    expect(r.flags).toEqual(["card_missing"]);
  });

  it("validates and truncates card fields", () => {
    const r = parseModelOutput(
      out(
        card({
          match: "c9",
          domain: "deep-learning",
          aliases: Array.from({ length: 12 }, (_, i) => `alias${i}`).concat(["<script>", "x".repeat(81)]),
          broader: ["PEFT", "Fine-tuning"],
          variants: ["QLoRA", "DoRA", "LoRA+", "AdaLoRA", "VeRA"],
          prerequisites: ["Low-rank matrix", 42],
          confidence: { broader: 0.95, variants: -1, prerequisites: "high" },
        }),
      ),
      labels,
    );
    expect(r.card).toEqual({
      matchConceptId: null,
      canonical: "LoRA",
      aliases: Array.from({ length: 8 }, (_, i) => `alias${i}`),
      domain: "other",
      broader: ["PEFT"],
      variants: ["QLoRA", "DoRA", "LoRA+"],
      prerequisites: ["Low-rank matrix"],
      confidence: { broader: 0.8, variants: 0, prerequisites: 0.5 },
    });
  });

  it("rejects a card whose canonical name is invalid", () => {
    expect(parseModelOutput(out(card({ canonical: "" })), labels).card).toBeNull();
    expect(parseModelOutput(out(card({ canonical: "a\nb" })), labels).card).toBeNull();
  });
});

describe("streamingExplanation", () => {
  it("returns the explanation text received so far", () => {
    expect(streamingExplanation("<expl")).toBe("");
    expect(streamingExplanation("<explanation>低秩")).toBe("低秩");
    expect(streamingExplanation("<explanation>低秩适配。</expla")).toBe("低秩适配。");
    expect(streamingExplanation("<explanation>低秩适配。</explanation><evidence>")).toBe("低秩适配。");
    expect(streamingExplanation("No tags at all")).toBe("No tags at all");
  });
});
