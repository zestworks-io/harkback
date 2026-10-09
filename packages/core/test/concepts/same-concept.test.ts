import { describe, expect, it } from "vitest";
import {
  acronymOf,
  findCandidates,
  identityKey,
  Matcher,
  matcherEntriesFromState,
  parseModelOutput,
  replay,
  selectReunions,
  stripDeterminers,
} from "../../src";
import { concept, encounter, id } from "../helpers";

describe("one term, many spellings", () => {
  it("ignores leading articles and a trailing possessive", () => {
    expect(stripDeterminers("the LLM's")).toBe("LLM");
    expect(identityKey("the LLM")).toBe(identityKey("LLM"));
    expect(identityKey("The Large Language Models")).toBe(identityKey("large language model"));
    expect(identityKey("A/B testing")).not.toBe(identityKey("B testing"));
    expect(identityKey("a")).toBe("a");
  });

  it("builds abbreviations from multi-word names", () => {
    expect(acronymOf("Large Language Model")).toBe("LLM");
    expect(acronymOf("large-language models")).toBe("LLM");
    expect(acronymOf("Reinforcement Learning from Human Feedback")).toBe("RLHF");
    expect(acronymOf("Retrieval-Augmented Generation")).toBe("RAG");
    expect(acronymOf("attention")).toBeNull();
    expect(acronymOf("低秩 适配")).toBeNull();
  });
});

describe("abbreviation and full name", () => {
  const separate = replay([
    concept(1, "LLM"),
    encounter(10, 1, "arxiv:1"),
    concept(2, "Large Language Model"),
    encounter(11, 2, "arxiv:2"),
  ]);

  it("merges concepts recorded separately", () => {
    expect(separate.representative.get(id(1))).toBe(separate.representative.get(id(2)));
    expect(separate.concepts.size).toBe(1);
  });

  it("does not merge across domains, nor when two full names share the abbreviation", () => {
    const domains = replay([concept(1, "GNN", "ml"), concept(2, "Graph Neural Network", "math")]);
    expect(domains.concepts.size).toBe(2);
    const clash = replay([concept(1, "GNN"), concept(2, "Graph Neural Network"), concept(3, "Generative Neural Network")]);
    expect(clash.concepts.size).toBe(3);
  });

  it("knows the abbreviation of a name that was only recorded in full", () => {
    const state = replay([concept(1, "Large Language Model"), encounter(10, 1, "arxiv:1", "2026-09-01T00:00:00Z")]);
    const info = state.aliases.get("LLM");
    expect(info).toMatchObject({ derived: true, ambiguous: false, conceptIds: [id(1)] });
    const hits = new Matcher(matcherEntriesFromState(state)).scan("Recent LLMs are large. An llm is not an LLM.");
    expect(hits.map((h) => h.text)).toEqual(["LLMs", "LLM"]);
    const reunions = selectReunions(state, hits, { sourceId: "arxiv:2", now: Date.parse("2026-09-20T00:00:00Z") });
    expect(reunions.map((r) => r.conceptId)).toEqual([id(1)]);
  });

  it("marks an abbreviation shared by different concepts as ambiguous", () => {
    const state = replay([concept(1, "Graph Neural Network"), concept(2, "Generative Neural Network")]);
    expect(state.aliases.get("GNN")?.ambiguous).toBe(true);
  });

  it("offers the concept as a candidate whichever form is selected", () => {
    const state = replay([concept(1, "Large Language Model"), concept(2, "attention")]);
    expect(findCandidates(state, "LLM")[0]).toMatchObject({ conceptId: id(1), score: 1 });
    expect(findCandidates(state, "llm")[0]).toMatchObject({ conceptId: id(1) });
    const abbreviated = replay([concept(1, "LLM"), concept(2, "attention")]);
    expect(findCandidates(abbreviated, "large language models")[0]).toMatchObject({ conceptId: id(1), score: 0.9 });
    expect(findCandidates(abbreviated, "the large language model")[0]?.conceptId).toBe(id(1));
  });

  it("shows a concept inside a longer selection to the model without asking the reader", () => {
    const state = replay([concept(1, "LLM")]);
    const top = findCandidates(state, "the LLM agent")[0];
    expect(top?.conceptId).toBe(id(1));
    expect(top!.score).toBeLessThan(0.6);
  });
});

describe("matching page text", () => {
  it("matches an alias that was recorded with an article", () => {
    const state = replay([concept(1, "Transformer", "ml", ["the attention block"]), encounter(10, 1, "arxiv:1")]);
    const hits = new Matcher(matcherEntriesFromState(state)).scan("Each attention block has two layers.");
    expect(hits.map((h) => h.text)).toEqual(["attention block"]);
  });

  it("folds ligatures, full-width letters and Greek names", () => {
    const state = replay([concept(1, "fine-tuning"), concept(2, "β-VAE", "ml")]);
    const m = new Matcher(matcherEntriesFromState(state));
    expect(m.scan("We ﬁne-tune and use ﬁne-tuning.").map((h) => h.text)).toEqual(["ﬁne-tuning"]);
    expect(m.scan("The beta-VAE objective.").map((h) => h.text)).toEqual(["beta-VAE"]);
    expect(m.scan("The β-VAE objective.").map((h) => h.text)).toEqual(["β-VAE"]);
  });
});

describe("model output that is not quite in shape", () => {
  const labels = new Map([["c1", "CONCEPT_1"]]);
  const card =
    '{"match": "C1: LoRA", "canonical": "LoRA", "aliases": "Low-Rank Adaptation", "domain": "ml", "broader": [], "variants": [],';

  it("reads a card that was cut off, has a trailing comma, or has a decorated label", () => {
    const r = parseModelOutput(`<explanation>好。</explanation><evidence>NONE</evidence><card>${card} "prerequisites": [],}`, labels);
    expect(r.card).toMatchObject({ matchConceptId: "CONCEPT_1", canonical: "LoRA", aliases: ["Low-Rank Adaptation"] });
    expect(r.flags).toEqual([]);
  });

  it("keeps an explanation whose closing tag never arrived", () => {
    const r = parseModelOutput("<explanation>LoRA 是一种微调方法。", labels);
    expect(r.explanation).toBe("LoRA 是一种微调方法。");
  });
});
