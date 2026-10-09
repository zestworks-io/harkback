import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { eventSchema, parseEvent } from "../src";

const base = {
  v: 1,
  id: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  device: "dev_7f3a",
  seq: 1,
  ts: "2026-09-24T10:12:00Z",
  enc: "none",
} as const;

const conceptCreated = {
  ...base,
  type: "concept.created",
  payload: { concept_id: "01J8Z3K4M5N6P7Q8R9S0T1V2W4", canonical_name: "LoRA", aliases: ["Low-Rank Adaptation"], domain: "ml" },
};

describe("parseEvent", () => {
  it("accepts a valid event", () => {
    const r = parseEvent(conceptCreated);
    expect(r.kind).toBe("event");
  });

  it("rejects a domain outside the enum", () => {
    const r = parseEvent({ ...conceptCreated, payload: { ...conceptCreated.payload, domain: "deep-learning" } });
    expect(r.kind).toBe("invalid");
  });

  it("keeps events from a newer envelope version as future", () => {
    const r = parseEvent({ ...conceptCreated, v: 2, type: "something.new" });
    expect(r.kind).toBe("future");
  });

  it("accepts a compacted encounter.created with null payload", () => {
    const r = parseEvent({ ...base, type: "encounter.created", payload: null });
    expect(r.kind).toBe("event");
  });

  it("rejects events larger than 64KB before schema validation", () => {
    const huge = { ...conceptCreated, payload: { ...conceptCreated.payload, canonical_name: "a".repeat(70000) } };
    expect(parseEvent(huge)).toEqual({ kind: "invalid", reason: "too_large" });
  });

  it("rejects a malformed device id", () => {
    expect(parseEvent({ ...conceptCreated, device: "laptop" }).kind).toBe("invalid");
  });
});

const encounterCreated = (locator: Record<string, unknown>) => ({
  ...base,
  type: "encounter.created",
  payload: {
    encounter_id: "01J8Z3K4M5N6P7Q8R9S0T1V2W5",
    concept_id: "01J8Z3K4M5N6P7Q8R9S0T1V2W4",
    source_id: "youtube:dQw4w9WgXcQ",
    locator: { exact: "LoRA", prefix: "we fine-tune with ", suffix: " adapters", ...locator },
    selection: "LoRA",
    explanation: { text: "A method.", tier: "external_knowledge", evidence_span: null, model: "m" },
    flags: [],
  },
});

describe("locator timestamp", () => {
  it("accepts a locator without t, as in every earlier log", () => {
    expect(parseEvent(encounterCreated({})).kind).toBe("event");
  });

  it("accepts a whole-second playback position", () => {
    expect(parseEvent(encounterCreated({ t: 754 })).kind).toBe("event");
    expect(parseEvent(encounterCreated({ t: 0 })).kind).toBe("event");
  });

  it.each([-1, 1.5, 1_000_001, "754"])("rejects t = %s", (t) => {
    expect(parseEvent(encounterCreated({ t })).kind).toBe("invalid");
  });
});

describe("JSON Schema", () => {
  it("committed schema matches the zod definition", () => {
    const committed = JSON.parse(readFileSync("packages/spec/schema/event.schema.json", "utf8"));
    expect(committed).toEqual(z.toJSONSchema(eventSchema));
  });
});

describe("parseEvent size limit", () => {
  it("applies the 64KB limit to events from newer envelope versions too", () => {
    expect(parseEvent({ ...conceptCreated, v: 2, pad: "x".repeat(70000) })).toEqual({ kind: "invalid", reason: "too_large" });
  });
});
