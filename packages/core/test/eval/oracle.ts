import type { EvalSet, Recording } from "../../src/eval/evaluate";
import { lookupKey } from "../../src/eval/evaluate";

/**
 * Answers built from a set's own labels, as a model that knows them would give: the gold names, the gold relations, and a
 * sentence of the paragraph as evidence when the term is labelled defined. Scoring them must find nothing wrong; a miss
 * means the reunion labels disagree with the concepts' names and relations (a reunion expected that nothing on the page can
 * show, or one shown that the labels do not expect). It does not check the `defined` flags: the quoted sentence is always
 * on the page, whether or not it defines the term.
 */
export function oracleRecording(set: EvalSet, domain: string): Recording {
  const first = (label: string) => set.concepts[label]![0]!;
  const outputs: Record<string, string> = {};
  for (const paper of set.papers) {
    paper.lookups.forEach((l, i) => {
      const names = set.concepts[l.concept]!;
      const text = paper.paragraphs[l.paragraph]!.text;
      const sentence = text.split(/(?<=[.!?:;])\s+/).find((s) => s.toLowerCase().includes(l.selection.toLowerCase())) ?? text;
      const card = {
        match: null,
        canonical: names[0],
        aliases: names.slice(1),
        translations: [],
        domain,
        broader: set.relations
          .filter((r) => r.rel === "variant_of" && r.from === l.concept)
          .map((r) => first(r.to))
          .slice(0, 1),
        variants: set.relations
          .filter((r) => r.rel === "variant_of" && r.to === l.concept)
          .map((r) => first(r.from))
          .slice(0, 3),
        prerequisites: set.relations
          .filter((r) => r.rel === "prerequisite" && r.from === l.concept)
          .map((r) => first(r.to))
          .slice(0, 3),
        confidence: { broader: 0.9, variants: 0.8, prerequisites: 0.75 },
      };
      outputs[lookupKey(paper, i)] = [
        `<explanation>${l.selection} is ${names[0]} as used in this paper.</explanation>`,
        `<evidence>${l.defined ? sentence : "NONE"}</evidence>`,
        `<card>${JSON.stringify(card)}</card>`,
      ].join("\n");
    });
  }
  return { model: "oracle", outputs };
}
