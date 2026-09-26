import { createEventFactory, replay, ulid, type State } from "@harkback/core";
import type { HarkEvent, Sensitivity } from "@harkback/spec";

/** A small event log builder for tests. */
export function world(start = Date.UTC(2026, 8, 1)) {
  let seq = 0;
  let clock = start;
  const events: HarkEvent[] = [];
  const f = createEventFactory({ device: "dev_aaaa", nextSeq: () => ++seq, now: () => clock });
  const add = <T extends HarkEvent>(e: T): T => {
    events.push(e);
    return e;
  };
  return {
    f,
    events,
    setTime(ms: number): void {
      clock = ms;
    },
    source(sourceId: string, sensitivity: Sensitivity = "normal", title = sourceId): void {
      add(f.make("source.seen", { source_id: sourceId, ids: {}, title, license: "unknown", sensitivity }));
    },
    concept(name: string, aliases: string[] = []): string {
      const conceptId = ulid();
      add(f.make("concept.created", { concept_id: conceptId, canonical_name: name, aliases, domain: "ml" }));
      return conceptId;
    },
    encounter(conceptId: string, sourceId: string, text = "earlier explanation"): string {
      const encounterId = ulid();
      add(
        f.make("encounter.created", {
          encounter_id: encounterId,
          concept_id: conceptId,
          source_id: sourceId,
          locator: { exact: "LoRA", prefix: "we use", suffix: "here", section: "2 Method" },
          selection: "LoRA",
          explanation: { text, tier: "external_knowledge", evidence_span: null, model: "m" },
          flags: [],
        }),
      );
      return encounterId;
    },
    state(): State {
      return replay(events);
    },
  };
}
