import { describe, expect, it } from "vitest";
import { parseEvent, type HarkEvent } from "@harkback/spec";
import { buildRecordEvents, createEventFactory, replay, resolveConcept, type ParsedOutput, type RecordInput } from "../src";
import { concept, ev, id } from "./helpers";

const source = { source_id: "arxiv:2305.14314", ids: { arxiv: "2305.14314" }, title: "QLoRA", license: "unknown", sensitivity: "normal" as const };
const locator = { exact: "LoRA", prefix: "we apply ", suffix: " to", section: "3" };

const parsed = (card: ParsedOutput["card"]): ParsedOutput => ({
  explanation: "低秩适配。",
  evidence: null,
  card,
  flags: card ? [] : ["card_missing"],
});

const card = (o: Partial<NonNullable<ParsedOutput["card"]>> = {}): NonNullable<ParsedOutput["card"]> => ({
  matchConceptId: null,
  canonical: "LoRA",
  aliases: ["Low-Rank Adaptation", "低秩适配"],
  domain: "ml",
  broader: ["PEFT"],
  variants: ["QLoRA"],
  prerequisites: ["Matrix rank"],
  confidence: { broader: 0.7, variants: 0.7, prerequisites: 0.5 },
  ...o,
});

function input(o: Partial<RecordInput>, events: HarkEvent[] = []): RecordInput {
  let seq = 0;
  let n = 0;
  return {
    factory: createEventFactory({ device: "dev_aaaa", nextSeq: () => ++seq, now: () => Date.UTC(2026, 8, 24) }),
    state: replay(events),
    source,
    selection: "LoRA",
    locator,
    parsed: parsed(card()),
    tier: "external_knowledge",
    model: "test-model",
    conceptId: null,
    newId: () => id(500 + ++n),
    ...o,
  };
}

describe("resolveConcept", () => {
  const candidate = { conceptId: id(1), canonicalName: "LoRA", domain: "ml" as const, score: 0.7, isPlaceholder: false };
  it("uses the model's match first", () => {
    expect(resolveConcept(parsed(card({ matchConceptId: id(1) })), [])).toEqual({ kind: "existing", conceptId: id(1) });
  });
  it("asks the user when a close candidate exists but the model did not match", () => {
    expect(resolveConcept(parsed(card()), [candidate])).toEqual({ kind: "ask_user", candidate });
  });
  it("creates a new concept otherwise", () => {
    expect(resolveConcept(parsed(card()), [{ ...candidate, score: 0.4 }])).toEqual({ kind: "new" });
  });
});

describe("buildRecordEvents", () => {
  it("creates source, concept, encounter, placeholders and edges for a new concept", () => {
    const events = buildRecordEvents(input({}));
    expect(events.map((e) => e.type)).toEqual([
      "source.seen",
      "concept.created",
      "encounter.created",
      "concept.created",
      "edge.proposed",
      "concept.created",
      "edge.proposed",
      "concept.created",
      "edge.proposed",
    ]);
    for (const e of events) expect(parseEvent(e).kind).toBe("event");
    const state = replay(events);
    const lora = [...state.concepts.values()].find((c) => c.canonicalName === "LoRA")!;
    expect(lora.isPlaceholder).toBe(false);
    expect(lora.names).toEqual(["LoRA", "Low-Rank Adaptation", "低秩适配"]);
    const qlora = [...state.concepts.values()].find((c) => c.canonicalName === "QLoRA")!;
    expect(qlora.isPlaceholder).toBe(true);
    expect(state.edges.get(`${qlora.id}>variant_of>${lora.id}`)?.confidence).toBe(0.7);
  });

  it("adds only unknown aliases to an existing concept and reuses known concepts for edges", () => {
    const prior = [
      ev("source.seen", source),
      concept(1, "LoRA", "ml", ["Low-Rank Adaptation"]),
      concept(2, "PEFT"),
    ];
    const events = buildRecordEvents(input({ conceptId: id(1) }, prior));
    expect(events.filter((e) => e.type === "source.seen")).toHaveLength(0);
    const aliasEvents = events.filter((e) => e.type === "concept.alias_added");
    expect(aliasEvents.map((e) => (e.type === "concept.alias_added" ? e.payload.alias : ""))).toEqual(["低秩适配"]);
    const edgeToPeft = events.find((e) => e.type === "edge.proposed" && e.payload.to === id(2));
    expect(edgeToPeft).toBeDefined();
  });

  it("resolves a merged concept id to its representative", () => {
    const prior = [concept(1, "LoRA"), concept(2, "Low-Rank Adaptation"), ev("concept.merged", { from: id(2), into: id(1) })];
    const events = buildRecordEvents(input({ conceptId: id(2), parsed: parsed(null) }, prior));
    const enc = events.find((e) => e.type === "encounter.created");
    expect(enc?.type === "encounter.created" && enc.payload?.concept_id).toBe(id(1));
  });

  it("records card_missing without edges when there is no card", () => {
    const events = buildRecordEvents(input({ parsed: parsed(null) }));
    expect(events.some((e) => e.type === "edge.proposed")).toBe(false);
    const enc = events.find((e) => e.type === "encounter.created");
    expect(enc?.type === "encounter.created" && enc.payload?.flags).toEqual(["card_missing"]);
  });

  it("skips edges that point back to the concept itself", () => {
    const events = buildRecordEvents(input({ parsed: parsed(card({ broader: ["Low-Rank Adaptation"], variants: [], prerequisites: [] })) }));
    expect(events.some((e) => e.type === "edge.proposed")).toBe(false);
  });

  it("rejects a selection that normalizes to nothing", () => {
    expect(() => buildRecordEvents(input({ selection: " ,.; " }))).toThrow("empty selection");
  });
});
