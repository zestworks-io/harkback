import { describe, expect, it } from "vitest";
import { createEventFactory, parseJsonl, replay, serializeJsonl, ulid, withoutSensitive } from "../../src";
import type { HarkEvent } from "@harkback/spec";

function log() {
  let seq = 0;
  const f = createEventFactory({ device: "dev_aaaa", nextSeq: () => ++seq, now: () => Date.UTC(2026, 8, 1) + seq * 1000 });
  const events: HarkEvent[] = [];
  const source = (id: string, sensitivity: "normal" | "sensitive", by_user?: boolean) =>
    events.push(f.make("source.seen", { source_id: id, ids: {}, title: id, license: "unknown", sensitivity, ...(by_user && { by_user }) }));
  const concept = (name: string) => {
    const concept_id = ulid();
    events.push(f.make("concept.created", { concept_id, canonical_name: name, aliases: [], domain: "ml" }));
    return concept_id;
  };
  const encounter = (concept_id: string, source_id: string) => {
    const encounter_id = ulid();
    events.push(
      f.make("encounter.created", {
        encounter_id,
        concept_id,
        source_id,
        locator: { exact: "x", prefix: "", suffix: "" },
        selection: "x",
        explanation: { text: "t", tier: "external_knowledge", evidence_span: null, model: "m" },
        flags: [],
      }),
    );
    return encounter_id;
  };
  return { f, events, source, concept, encounter };
}

describe("withoutSensitive", () => {
  it("drops sensitive sources, their encounters, and concepts known only from them", () => {
    const l = log();
    l.source("pub", "normal");
    l.source("secret", "sensitive");
    const open = l.concept("Open");
    const hidden = l.concept("Hidden");
    const shared = l.concept("Shared");
    const eOpen = l.encounter(open, "pub");
    const eHidden = l.encounter(hidden, "secret");
    l.encounter(shared, "pub");
    const eShared = l.encounter(shared, "secret");
    l.events.push(l.f.make("encounter.action", { encounter_id: eHidden, action: "marked_confused" }));
    l.events.push(l.f.make("encounter.action", { encounter_id: eOpen, action: "marked_understood" }));
    l.events.push(l.f.make("edge.proposed", { from: open, to: hidden, rel: "related", source: "user", confidence: 0.5, evidence: {} }));
    l.events.push(
      l.f.make("edge.proposed", {
        from: shared,
        to: open,
        rel: "related",
        source: "user",
        confidence: 0.5,
        evidence: { encounter_id: eShared },
      }),
    );
    l.events.push(l.f.make("concept.alias_added", { concept_id: hidden, alias: "Secret thing" }));

    const kept = replay(withoutSensitive(l.events));
    expect([...kept.sources.keys()]).toEqual(["pub"]);
    expect([...kept.concepts.values()].map((c) => c.canonicalName).sort()).toEqual(["Open", "Shared"]);
    expect(kept.encounters.has(eHidden)).toBe(false);
    expect(kept.encounters.has(eShared)).toBe(false);
    expect(kept.encounters.has(eOpen)).toBe(true);
    expect(kept.edges.size).toBe(0);
    expect(serializeJsonl(withoutSensitive(l.events))).not.toContain("Secret thing");
  });

  it("returns everything when nothing is sensitive, and the result is valid JSONL", () => {
    const l = log();
    l.source("pub", "normal");
    l.encounter(l.concept("A"), "pub");
    const out = withoutSensitive(l.events);
    expect(out).toEqual(l.events);
    expect(parseJsonl(serializeJsonl(out)).skipped).toEqual([]);
  });
});

describe("withoutSensitive with a sensitive repository", () => {
  it("also drops its issues, whether or not they were recorded as sensitive", () => {
    const l = log();
    l.source("github:acme/secret", "sensitive");
    l.source("github:acme/secret#4", "normal");
    l.source("github:acme/open#1", "normal");
    const hidden = l.concept("Hidden");
    const open = l.concept("Open");
    const eIssue = l.encounter(hidden, "github:acme/secret#4");
    const eOpen = l.encounter(open, "github:acme/open#1");
    const kept = replay(withoutSensitive(l.events));
    expect([...kept.sources.keys()]).toEqual(["github:acme/open#1"]);
    expect(kept.encounters.has(eIssue)).toBe(false);
    expect(kept.encounters.has(eOpen)).toBe(true);
  });
});

describe("sensitive sources stay sensitive", () => {
  it("ignores a later automatic normal record but obeys the reader's own choice", () => {
    const l = log();
    l.source("s", "sensitive");
    l.source("s", "normal");
    expect(replay(l.events).sources.get("s")!.sensitivity).toBe("sensitive");
    l.source("s", "normal", true);
    expect(replay(l.events).sources.get("s")!.sensitivity).toBe("normal");
    l.source("s", "sensitive");
    l.source("s", "normal");
    expect(replay(l.events).sources.get("s")!.sensitivity).toBe("sensitive");
  });
});

describe("withoutSensitive with rules of its own", () => {
  it("also drops a source the rules call sensitive, and what is known only from it", () => {
    const l = log();
    l.source("kept", "normal");
    l.source("ruled", "normal");
    const open = l.concept("Open");
    const ruledOnly = l.concept("Ruled only");
    l.encounter(open, "kept");
    l.encounter(ruledOnly, "ruled");
    const out = replay(withoutSensitive(l.events, (s) => s.id === "ruled"));
    expect([...out.sources.keys()]).toEqual(["kept"]);
    expect([...out.concepts.values()].map((c) => c.canonicalName)).toEqual(["Open"]);
    expect(out.encounters.size).toBe(1);
  });

  it("changes nothing when no rule applies", () => {
    const l = log();
    l.source("kept", "normal");
    l.encounter(l.concept("Open"), "kept");
    expect(withoutSensitive(l.events, () => false)).toEqual(l.events);
  });
});
