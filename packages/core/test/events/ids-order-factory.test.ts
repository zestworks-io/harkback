import { describe, expect, it } from "vitest";
import { parseEvent, type HarkEvent } from "@harkback/spec";
import { canonicalOrder, compareEvents, createEventFactory, edgeId, newDeviceId, parseEdgeId, ulid } from "../../src";

const zeros = (n: number) => new Uint8Array(n);

describe("ids", () => {
  it("encodes a ULID with a time prefix", () => {
    expect(ulid(0, zeros)).toBe("0".repeat(26));
    expect(ulid(Date.now())).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(ulid(1, zeros) < ulid(2, zeros)).toBe(true);
  });

  it("creates device ids accepted by the schema", () => {
    expect(newDeviceId()).toMatch(/^dev_[0-9a-f]{16}$/);
    expect(newDeviceId("svc")).toMatch(/^svc_[0-9a-f]{16}$/);
  });

  it("round-trips edge ids", () => {
    const id = edgeId("A", "variant_of", "B");
    expect(id).toBe("A>variant_of>B");
    expect(parseEdgeId(id)).toEqual({ from: "A", rel: "variant_of", to: "B" });
    expect(parseEdgeId("A>unknown>B")).toBeNull();
    expect(parseEdgeId("nonsense")).toBeNull();
  });
});

function e(ts: string, device: string, seq: number, id: string): HarkEvent {
  return { v: 1, id, device, seq, ts, enc: "none", type: "concept.muted", payload: { concept_id: "0".repeat(26) } };
}

describe("order", () => {
  it("compares timestamps numerically, including fractional seconds", () => {
    const a = e("2026-09-24T10:12:00Z", "dev_aaaa", 1, "01J00000000000000000000001");
    const b = e("2026-09-24T10:12:00.500Z", "dev_aaaa", 2, "01J00000000000000000000002");
    expect(compareEvents(a, b)).toBeLessThan(0);
  });

  it("breaks ties by device, seq, then id, and removes duplicate ids", () => {
    const a = e("2026-09-24T10:12:00Z", "dev_bbbb", 1, "01J00000000000000000000003");
    const b = e("2026-09-24T10:12:00Z", "dev_aaaa", 5, "01J00000000000000000000004");
    const c = e("2026-09-24T10:12:00Z", "dev_aaaa", 5, "01J00000000000000000000002");
    expect(canonicalOrder([a, b, c, a]).map((x) => x.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe("factory", () => {
  it("produces schema-valid events with increasing seq", () => {
    let seq = 0;
    const f = createEventFactory({ device: "dev_aaaa", nextSeq: () => ++seq, now: () => Date.UTC(2026, 8, 24) });
    const first = f.make("concept.muted", { concept_id: ulid() });
    const second = f.make("concept.unmuted", { concept_id: ulid() });
    expect(parseEvent(first).kind).toBe("event");
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(first.ts).toBe("2026-09-24T00:00:00.000Z");
  });
});
