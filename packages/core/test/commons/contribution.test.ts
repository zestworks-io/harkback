import { describe, expect, it } from "vitest";
import { buildContribution, edgeId, isContributable, replay, withoutSensitive } from "../../src";
import { concept, encounter, ev, id } from "../helpers";

const paper = (sourceId: string, ids: Record<string, string>, license: string, sensitivity: "normal" | "sensitive" = "normal") =>
  ev("source.seen", { source_id: sourceId, ids, title: "T", license, sensitivity, ...(sensitivity === "sensitive" && { by_user: true }) });

const action = (encounterN: number, a: "review_hard" | "marked_confused" | "followed_up", ts = "2026-09-11T00:00:00Z") =>
  ev("encounter.action", { encounter_id: id(encounterN), action: a }, { ts });

function events() {
  return [
    paper("arxiv:2106.09685", { arxiv: "2106.09685", url: "https://arxiv.org/abs/2106.09685" }, "cc-by-4.0"),
    paper("doi:10.1/x", { doi: "10.1/x" }, "arxiv-nonexclusive"),
    paper("url:https://blog.example/post", { url: "https://blog.example/post" }, "cc-by-4.0"),
    paper("arxiv:2305.14314", { arxiv: "2305.14314" }, "cc-by-4.0", "sensitive"),
    concept(1, "LoRA"),
    concept(2, "Low-rank matrix"),
    concept(3, "QLoRA"),
    encounter(10, 1, "arxiv:2106.09685"),
    encounter(11, 2, "arxiv:2106.09685"),
    encounter(12, 1, "doi:10.1/x"),
    encounter(13, 1, "url:https://blog.example/post"),
    encounter(14, 3, "arxiv:2305.14314"),
    action(10, "review_hard"),
    action(10, "followed_up", "2026-09-12T00:00:00Z"),
    ev("edge.proposed", {
      from: id(1),
      to: id(2),
      rel: "prerequisite",
      source: "llm_explain",
      confidence: 0.9,
      evidence: { encounter_id: id(10) },
    }),
    ev("edge.confirmed", { edge_id: edgeId(id(1), "prerequisite", id(2)) }),
    ev("edge.proposed", {
      from: id(2),
      to: id(1),
      rel: "related",
      source: "llm_explain",
      confidence: 0.9,
      evidence: { encounter_id: id(11) },
    }),
  ];
}

describe("buildContribution", () => {
  it("holds only openly licensed papers nobody called sensitive, with no text, address or exact time", () => {
    const c = buildContribution(replay(events()), { scope: "all_public_sources", target: null });
    expect(c.records).toEqual([
      {
        paper: "arxiv:2106.09685",
        license: "cc-by-4.0",
        term: "LoRA",
        domain: "ml",
        section: null,
        tier: "external_knowledge",
        understanding: "shaky",
        month: "2026-09",
      },
      {
        paper: "arxiv:2106.09685",
        license: "cc-by-4.0",
        term: "Low-rank matrix",
        domain: "ml",
        section: null,
        tier: "external_knowledge",
        understanding: "unrated",
        month: "2026-09",
      },
    ]);
    const text = JSON.stringify(c);
    for (const secret of ["explanation 10", "https://", "dev_aaaa", "2026-09-10T", "QLoRA"]) expect(text).not.toContain(secret);
  });

  it("includes only the relations the reader confirmed, between terms it contains", () => {
    expect(buildContribution(replay(events()), { scope: "all_public_sources", target: null }).relations).toEqual([
      { from: "LoRA", rel: "prerequisite", to: "Low-rank matrix" },
    ]);
  });

  it("leaves out a relation found on a sensitive page or only outside the contribution", () => {
    const variant = (evidence: number) => [
      ev("edge.proposed", {
        from: id(2),
        to: id(1),
        rel: "variant_of",
        source: "llm_explain",
        confidence: 0.9,
        evidence: { encounter_id: id(evidence) },
      }),
      ev("edge.confirmed", { edge_id: edgeId(id(2), "variant_of", id(1)) }),
    ];
    const all = { scope: "all_public_sources", target: null } as const;
    const rels = (state: ReturnType<typeof replay>, scope: Parameters<typeof buildContribution>[1] = all) =>
      buildContribution(state, scope).relations.map((r) => r.rel);
    // Found in a contributed paper and also on a sensitive one.
    expect(rels(replay([...events(), ...variant(10), ...variant(14)]))).toEqual(["prerequisite"]);
    // Found only on a page that is not contributed.
    expect(rels(replay([...events(), ...variant(13)]))).toEqual(["prerequisite"]);
    // One look-up contributed: the relation was found in another.
    expect(rels(replay(events()), { scope: "this_record", target: id(11) })).toEqual([]);
  });

  it("leaves out a term highlighted in Zotero until it is explained", () => {
    const imported = encounter(15, 3, "arxiv:2106.09685");
    imported.payload!.explanation = { text: "", tier: "external_knowledge", evidence_span: null, model: "zotero" };
    const terms = (extra: ReturnType<typeof ev>[]) =>
      buildContribution(replay([...events(), imported, ...extra]), { scope: "all_public_sources", target: null }).records.map(
        (r) => r.term,
      );
    expect(terms([])).toEqual(["LoRA", "Low-rank matrix"]);
    const explained = ev("encounter.explained", {
      encounter_id: id(15),
      explanation: { text: "Quantised LoRA.", tier: "external_knowledge", evidence_span: null, model: "m" },
    });
    expect(terms([explained])).toEqual(["LoRA", "Low-rank matrix", "QLoRA"]);
  });

  it("narrows to one source or one look-up", () => {
    const state = replay(events());
    expect(buildContribution(state, { scope: "this_source", target: "doi:10.1/x" }).records).toEqual([]);
    expect(buildContribution(state, { scope: "this_record", target: id(11) }).records.map((r) => r.term)).toEqual(["Low-rank matrix"]);
  });

  it("knows which sources may be contributed", () => {
    const state = replay(events());
    expect(isContributable(state, "arxiv:2106.09685")).toBe(true);
    expect(isContributable(state, "doi:10.1/x")).toBe(false);
    expect(isContributable(state, "url:https://blog.example/post")).toBe(false);
    expect(isContributable(state, "arxiv:2305.14314")).toBe(false);
    // A site rule the records know nothing of.
    expect(isContributable(state, "arxiv:2106.09685", (s) => s.ids.url?.startsWith("https://arxiv.org/") === true)).toBe(false);
    expect(buildContribution(state, { scope: "all_public_sources", target: null }, () => true).records).toEqual([]);
  });
});

describe("consent to contribute", () => {
  it("is replayed in order", () => {
    const state = replay([
      ev("contribution.consent", { scope: "this_source", target: "arxiv:1" }, { ts: "2026-09-02T00:00:00Z" }),
      ev("contribution.consent", { scope: "all_public_sources", target: null }, { ts: "2026-09-03T00:00:00Z" }),
    ]);
    expect(state.consents).toEqual([
      { scope: "this_source", target: "arxiv:1", at: Date.parse("2026-09-02T00:00:00Z") },
      { scope: "all_public_sources", target: null, at: Date.parse("2026-09-03T00:00:00Z") },
    ]);
  });

  it("is left out of a backup without sensitive sources when it names one", () => {
    const named = ev("contribution.consent", { scope: "this_source", target: "arxiv:2305.14314" });
    const all = ev("contribution.consent", { scope: "all_public_sources", target: null });
    const kept = withoutSensitive([...events(), named, all]);
    expect(kept).toContain(all);
    expect(kept).not.toContain(named);
  });

  it("keeps a licence once seen when a later record could not see it", () => {
    const state = replay([
      paper("arxiv:1", { arxiv: "1" }, "cc-by-4.0"),
      ev(
        "source.seen",
        { source_id: "arxiv:1", ids: {}, title: "T", license: "unknown", sensitivity: "normal" },
        { ts: "2026-09-02T00:00:00Z" },
      ),
    ]);
    expect(state.sources.get("arxiv:1")?.license).toBe("cc-by-4.0");
  });
});
