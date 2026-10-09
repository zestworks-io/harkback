import { describe, expect, it } from "vitest";
import { compactDeleted } from "../../src";
import { action, concept, encounter, ev, id } from "../helpers";

describe("compactDeleted", () => {
  it("clears payloads of deleted encounters and their actions only", () => {
    const events = [
      concept(1, "LoRA"),
      encounter(10, 1, "arxiv:1"),
      encounter(11, 1, "arxiv:2"),
      action(10, "marked_confused"),
      ev("encounter.deleted", { encounter_id: id(10) }),
    ];
    const out = compactDeleted(events);
    expect(out[1]!.payload).toBeNull();
    expect(out[2]!.payload).not.toBeNull();
    expect(out[3]!.payload).toBeNull();
    expect(out[4]!.payload).toEqual({ encounter_id: id(10) });
    expect(out.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });
});
