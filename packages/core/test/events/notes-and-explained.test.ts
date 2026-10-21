import { describe, expect, it } from "vitest";
import { compactDeleted, replay, withoutSensitive } from "../../src";
import { concept, ev, id } from "../helpers";

const created = (n: number, sourceId: string, text: string) =>
  ev("encounter.created", {
    encounter_id: id(n),
    concept_id: id(1),
    source_id: sourceId,
    locator: { exact: "LoRA", prefix: "", suffix: "" },
    selection: "LoRA",
    explanation: { text, tier: "external_knowledge", evidence_span: null, model: text ? "m" : "zotero" },
    flags: [],
  });
const noted = (n: number, text: string, ts = "2026-09-02T00:00:00Z") => ev("encounter.noted", { encounter_id: id(n), text }, { ts });
const explained = (n: number, text: string, ts = "2026-09-03T00:00:00Z") =>
  ev(
    "encounter.explained",
    {
      encounter_id: id(n),
      explanation: { text, tier: "external_knowledge", evidence_span: null, model: "gpt" },
    },
    { ts },
  );

describe("encounter notes and later explanations", () => {
  it("keeps the latest note, and an empty one removes it", () => {
    const base = [concept(1, "LoRA"), created(10, "s", "")];
    expect(replay([...base, noted(10, "key idea")]).encounters.get(id(10))!.note).toBe("key idea");
    expect(replay([...base, noted(10, "key idea"), noted(10, "", "2026-09-04T00:00:00Z")]).encounters.get(id(10))!.note).toBeUndefined();
  });

  it("fills in an encounter recorded without an explanation, and never replaces one", () => {
    const filled = replay([
      concept(1, "LoRA"),
      created(10, "s", ""),
      explained(10, "Low-rank adapters."),
      explained(10, "Another.", "2026-09-05T00:00:00Z"),
    ]);
    expect(filled.encounters.get(id(10))!.explanation).toMatchObject({ text: "Low-rank adapters.", model: "gpt" });
    expect(filled.encounters.get(id(10))!.lastTouchedAt).toBe(Date.parse("2026-09-03T00:00:00Z"));
    expect(filled.encounters.get(id(10))!.explainedAt).toBe(Date.parse("2026-09-03T00:00:00Z"));
    const kept = replay([concept(1, "LoRA"), created(10, "s", "Original."), explained(10, "Replacement.")]);
    expect(kept.encounters.get(id(10))!.explanation.text).toBe("Original.");
    expect(kept.encounters.get(id(10))!.explainedAt).toBeUndefined();
  });

  it("are cleared with a deleted encounter, and left out of a backup without sensitive sources", () => {
    const deleted = compactDeleted([
      concept(1, "LoRA"),
      created(10, "s", ""),
      noted(10, "key idea"),
      explained(10, "x"),
      ev("encounter.deleted", { encounter_id: id(10) }),
    ]);
    expect(deleted.filter((e) => e.type === "encounter.noted" || e.type === "encounter.explained").map((e) => e.payload)).toEqual([
      null,
      null,
    ]);

    const events = [
      ev("source.seen", { source_id: "secret", ids: {}, title: "S", license: "unknown", sensitivity: "sensitive", by_user: true }),
      ev("source.seen", { source_id: "pub", ids: {}, title: "P", license: "unknown", sensitivity: "normal" }),
      concept(1, "LoRA"),
      created(10, "secret", ""),
      created(11, "pub", ""),
      noted(10, "private"),
      noted(11, "public"),
      explained(10, "private"),
    ];
    const kept = withoutSensitive(events).filter((e) => e.type === "encounter.noted" || e.type === "encounter.explained");
    expect(kept.map((e) => e.payload)).toEqual([{ encounter_id: id(11), text: "public" }]);
  });
});
