import type { Action, Domain, EventOf, EventType, PayloadOf } from "@harkback/spec";

let counter = 0;

export function id(n: number): string {
  return `01J${String(n).padStart(23, "0")}`;
}

export function ev<T extends EventType>(
  type: T,
  payload: PayloadOf<T>,
  o: { ts?: string; device?: string; seq?: number; id?: string } = {},
): EventOf<T> {
  counter++;
  return {
    v: 1,
    id: o.id ?? id(900000 + counter),
    device: o.device ?? "dev_aaaa",
    seq: o.seq ?? counter,
    ts: o.ts ?? "2026-09-01T00:00:00Z",
    enc: "none",
    type,
    payload,
  } as unknown as EventOf<T>;
}

export function concept(n: number, name: string, domain: Domain = "ml", aliases: string[] = [], ts?: string) {
  return ev("concept.created", { concept_id: id(n), canonical_name: name, aliases, domain }, ts ? { ts } : {});
}

export function encounter(n: number, conceptN: number, sourceId: string, ts = "2026-09-10T00:00:00Z") {
  return ev(
    "encounter.created",
    {
      encounter_id: id(n),
      concept_id: id(conceptN),
      source_id: sourceId,
      locator: { exact: "x", prefix: "", suffix: "" },
      selection: "x",
      explanation: { text: `explanation ${n}`, tier: "external_knowledge", evidence_span: null, model: "test" },
      flags: [],
    },
    { ts },
  );
}

export function action(encounterN: number, act: Action, ts = "2026-09-11T00:00:00Z") {
  return ev("encounter.action", { encounter_id: id(encounterN), action: act }, { ts });
}
