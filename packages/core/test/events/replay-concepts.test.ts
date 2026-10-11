import { describe, expect, it } from "vitest";
import { canonicalOrder, resolveConcepts } from "../../src";
import { concept, ev, id } from "../helpers";

const resolve = (events: Parameters<typeof canonicalOrder>[0]) => resolveConcepts(canonicalOrder(events));

describe("resolveConcepts", () => {
  it("merges concepts with the same canonical name in the same domain; the smallest id represents", () => {
    const r = resolve([concept(2, "LoRA"), concept(1, "LoRA")]);
    expect(r.representative.get(id(2))).toBe(id(1));
    expect([...r.concepts.keys()]).toEqual([id(1)]);
  });

  it("merges when one canonical name is another concept's alias", () => {
    const r = resolve([concept(1, "LoRA", "ml", ["Low-Rank Adaptation"]), concept(2, "low rank adaptations")]);
    expect(r.representative.get(id(2))).toBe(id(1));
    expect(r.concepts.get(id(1))?.names).toEqual(["LoRA", "Low-Rank Adaptation"]);
  });

  it("does not merge across domains or across case for short names", () => {
    const r = resolve([concept(1, "LoRA", "ml"), concept(2, "LoRa", "networking"), concept(3, "LoRA", "networking")]);
    expect(r.concepts.size).toBe(3);
    expect(r.aliases.get("LoRA")?.conceptIds).toEqual([id(1), id(3)]);
    expect(r.aliases.get("LoRA")?.ambiguous).toBe(true);
    expect(r.aliases.get("LoRa")?.ambiguous).toBe(false);
  });

  it("resolves mutual merges and chains without cycles", () => {
    const r = resolve([
      concept(1, "alpha"),
      concept(2, "beta"),
      concept(3, "gamma"),
      ev("concept.merged", { from: id(1), into: id(2) }),
      ev("concept.merged", { from: id(2), into: id(1) }),
      ev("concept.merged", { from: id(3), into: id(2) }),
    ]);
    expect(new Set(r.representative.values())).toEqual(new Set([id(1)]));
    expect(r.concepts.get(id(1))?.members).toEqual([id(1), id(2), id(3)]);
  });

  it("marks built-in ambiguous acronyms", () => {
    const r = resolve([concept(1, "SAM")]);
    expect(r.aliases.get("SAM")?.ambiguous).toBe(true);
  });

  it("marks common medical and ML abbreviations as ambiguous, and keeps the list overridable", () => {
    for (const name of ["MS", "CAD", "PE", "RA", "CT", "AD", "PD", "ER", "CI", "GAN", "RNN", "SVM"]) {
      expect(resolve([concept(1, name)]).aliases.get(name)?.ambiguous, name).toBe(true);
    }
    const none = resolveConcepts(canonicalOrder([concept(1, "MS")]), new Set());
    expect(none.aliases.get("MS")?.ambiguous).toBe(false);
  });

  it("marks a short key shared by two concepts of one field as ambiguous, but not a long one", () => {
    const short = resolve([concept(1, "Foo Bar Baz", "ml", ["FBZ"]), concept(2, "Fast Bit Zip", "ml", ["FBZ"])]);
    expect(short.aliases.get("FBZ")?.conceptIds).toHaveLength(2);
    expect(short.aliases.get("FBZ")?.ambiguous).toBe(true);
    const long = resolve([concept(1, "Alpha One", "ml", ["Alphaxlong"]), concept(2, "Alpha Two", "ml", ["Alphaxlong"])]);
    expect(long.aliases.get("alphaxlong")?.conceptIds).toHaveLength(2);
    expect(long.aliases.get("alphaxlong")?.ambiguous).toBe(false);
  });

  it("does not treat a short ordinary word shared by two concepts as an abbreviation", () => {
    const r = resolve([concept(1, "Go Language", "ml", ["Go"]), concept(2, "Go Game", "ml", ["Go"])]);
    expect(r.aliases.get("Go")?.conceptIds).toHaveLength(2);
    expect(r.aliases.get("Go")?.ambiguous).toBe(false);
  });

  it("applies aliases added later and warns about unknown concepts", () => {
    const r = resolve([
      concept(1, "LoRA"),
      ev("concept.alias_added", { concept_id: id(1), alias: "低秩适配" }),
      ev("concept.alias_added", { concept_id: id(9), alias: "orphan" }),
      ev("concept.merged", { from: id(8), into: id(1) }),
    ]);
    expect(r.concepts.get(id(1))?.names).toContain("低秩适配");
    expect(r.aliases.get("低秩适配")?.script).toBe("cjk");
    expect(r.warnings).toHaveLength(2);
  });

  it("uses the latest concept.created for canonical name and domain", () => {
    const r = resolve([
      concept(1, "Attention", "ml", [], "2026-09-01T00:00:00Z"),
      concept(1, "Self-Attention", "ml", [], "2026-09-02T00:00:00Z"),
    ]);
    expect(r.concepts.get(id(1))?.canonicalName).toBe("Self-Attention");
    expect(r.concepts.get(id(1))?.names).toEqual(["Self-Attention"]);
  });

  describe("proposed aliases", () => {
    const proposal = (alias: string, n = 1) =>
      ev("concept.alias_proposed", { concept_id: id(n), alias, language: "zh", source: "llm_explain", evidence: { encounter_id: id(50) } });

    it("keeps a proposed name out of matching until it is confirmed", () => {
      const pending = resolve([concept(1, "LoRA"), proposal("低秩适配")]);
      expect(pending.concepts.get(id(1))?.proposedAliases).toEqual(["低秩适配"]);
      expect(pending.concepts.get(id(1))?.names).not.toContain("低秩适配");
      expect(pending.aliases.has("低秩适配")).toBe(false);

      const confirmed = resolve([
        concept(1, "LoRA"),
        proposal("低秩适配"),
        ev("concept.alias_confirmed", { concept_id: id(1), alias: "低秩适配" }),
      ]);
      expect(confirmed.concepts.get(id(1))?.proposedAliases).toEqual([]);
      expect(confirmed.concepts.get(id(1))?.names).toContain("低秩适配");
      expect(confirmed.aliases.get("低秩适配")?.conceptIds).toEqual([id(1)]);
    });

    it("remembers a rejected name and never matches it", () => {
      const r = resolve([concept(1, "LoRA"), proposal("洛拉"), ev("concept.alias_rejected", { concept_id: id(1), alias: "洛拉" })]);
      expect(r.concepts.get(id(1))?.proposedAliases).toEqual([]);
      expect(r.concepts.get(id(1))?.rejectedAliases).toEqual(["洛拉"]);
      expect(r.aliases.has("洛拉")).toBe(false);
    });

    it("leaves a log from before suggested names unchanged", () => {
      const r = resolve([
        concept(1, "LoRA", "ml", ["低秩适配"]),
        ev("concept.alias_added", { concept_id: id(1), alias: "Low-rank adapters" }),
      ]);
      expect(r.concepts.get(id(1))).toMatchObject({
        names: ["LoRA", "低秩适配", "Low-rank adapters"],
        proposedAliases: [],
        rejectedAliases: [],
      });
      expect(r.aliases.get("低秩适配")?.conceptIds).toEqual([id(1)]);
    });

    it("counts only a decision made after the proposal", () => {
      const early = resolve([concept(1, "LoRA"), ev("concept.alias_rejected", { concept_id: id(1), alias: "洛拉" }), proposal("洛拉")]);
      expect(early.concepts.get(id(1))?.proposedAliases).toEqual(["洛拉"]);
      const early2 = resolve([concept(1, "LoRA"), ev("concept.alias_confirmed", { concept_id: id(1), alias: "洛拉" }), proposal("洛拉")]);
      expect(early2.concepts.get(id(1))?.names).toEqual(["LoRA"]);
    });

    it("ignores a confirmation that has no proposal, and warns about an unknown concept", () => {
      const r = resolve([concept(1, "LoRA"), ev("concept.alias_confirmed", { concept_id: id(1), alias: "洛拉" }), proposal("x", 9)]);
      expect(r.concepts.get(id(1))?.names).toEqual(["LoRA"]);
      expect(r.warnings).toHaveLength(1);
    });

    it("moves a merged concept's proposals to the representative", () => {
      const r = resolve([
        concept(1, "LoRA"),
        concept(2, "Low-Rank Adaptation"),
        proposal("低秩适配", 2),
        ev("concept.merged", { from: id(2), into: id(1) }),
      ]);
      expect(r.concepts.get(id(1))?.proposedAliases).toEqual(["低秩适配"]);
    });
  });
});
