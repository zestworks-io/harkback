import { DAY_MS } from "@harkback/core";
import type { Action } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import { dueAtOf, intervalDays, nextDueAt, reviewQueue } from "../src/lib/review";
import { world } from "./helpers";

const T0 = Date.UTC(2026, 8, 1);
const day = (n: number) => T0 + n * DAY_MS;

function setup() {
  const w = world(T0);
  w.source("s1", "normal", "Paper One");
  const act = (encounterId: string, action: Action, at: number) => {
    w.setTime(at);
    w.events.push(w.f.make("encounter.action", { encounter_id: encounterId, action }));
  };
  return { w, act };
}

describe("reviewQueue", () => {
  it("is empty when nothing is due", () => {
    const { w } = setup();
    w.encounter(w.concept("LoRA"), "s1");
    expect(reviewQueue(w.state(), T0 + 1000)).toEqual([]);
  });

  it("makes an unmarked concept due one day after it was explained", () => {
    const { w } = setup();
    const c = w.concept("LoRA");
    w.encounter(c, "s1", "an explanation");
    const [item] = reviewQueue(w.state(), day(1));
    expect(item).toMatchObject({
      conceptId: c,
      name: "LoRA",
      understanding: "new",
      explanation: "an explanation",
      sourceTitle: "Paper One",
    });
  });

  it("makes a confused concept due one day after it was marked", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    act(w.encounter(c, "s1"), "marked_confused", day(2));
    expect(reviewQueue(w.state(), day(2) + DAY_MS - 1)).toEqual([]);
    expect(reviewQueue(w.state(), day(3))[0]).toMatchObject({ conceptId: c, understanding: "confused" });
  });

  it("spaces understood concepts further apart with every consecutive success", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "marked_understood", day(0));
    expect(reviewQueue(w.state(), day(2))).toEqual([]);
    expect(reviewQueue(w.state(), day(3))).toHaveLength(1);
    act(e, "marked_understood", day(3));
    expect(reviewQueue(w.state(), day(9))).toEqual([]);
    expect(reviewQueue(w.state(), day(10))).toHaveLength(1);
    act(e, "reunion_recalled", day(10));
    expect(reviewQueue(w.state(), day(23))).toEqual([]);
    expect(reviewQueue(w.state(), day(24))).toHaveLength(1);
  });

  it("caps the interval at 60 days", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    for (let i = 0; i < 8; i++) act(e, "marked_understood", day(i));
    const last = day(7);
    expect(reviewQueue(w.state(), last + 59 * DAY_MS)).toEqual([]);
    expect(reviewQueue(w.state(), last + 60 * DAY_MS)).toHaveLength(1);
  });

  it("starts over after a confused mark", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "marked_understood", day(0));
    act(e, "marked_understood", day(3));
    act(e, "marked_confused", day(10));
    act(e, "marked_understood", day(11));
    expect(reviewQueue(w.state(), day(13))).toEqual([]);
    expect(reviewQueue(w.state(), day(14))).toHaveLength(1);
  });

  it("ignores follow-ups and other non-decisive actions for the schedule", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "marked_understood", day(0));
    act(e, "followed_up", day(2));
    expect(reviewQueue(w.state(), day(3))).toHaveLength(1);
  });

  it("skips muted concepts and placeholders", () => {
    const { w } = setup();
    const muted = w.concept("Muted");
    w.encounter(muted, "s1");
    w.concept("Ghost");
    w.events.push(w.f.make("concept.muted", { concept_id: muted }));
    expect(reviewQueue(w.state(), day(30))).toEqual([]);
  });

  it("shows confused concepts first, then the most overdue", () => {
    const { w, act } = setup();
    const overdue = w.concept("Overdue");
    act(w.encounter(overdue, "s1"), "marked_understood", day(0));
    const fresh = w.concept("Fresh");
    w.setTime(day(9));
    w.encounter(fresh, "s1");
    const confused = w.concept("Confused");
    act(w.encounter(confused, "s1"), "marked_confused", day(9));
    const names = reviewQueue(w.state(), day(11)).map((i) => i.name);
    expect(names).toEqual(["Confused", "Overdue", "Fresh"]);
  });

  it("reviews the concept through its latest encounter", () => {
    const { w } = setup();
    const c = w.concept("LoRA");
    w.encounter(c, "s1", "older");
    w.setTime(day(1));
    const latest = w.encounter(c, "s1", "newer");
    const [item] = reviewQueue(w.state(), day(3));
    expect(item).toMatchObject({ encounterId: latest, explanation: "newer" });
  });

  it("limits the queue", () => {
    const { w } = setup();
    for (let i = 0; i < 5; i++) w.encounter(w.concept(`C${i}`), "s1");
    expect(reviewQueue(w.state(), day(2), { limit: 3 })).toHaveLength(3);
  });
});

describe("due dates", () => {
  it("waits one day, then 3, 7, 14, 30 and 60 days after each remembered review", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(intervalDays)).toEqual([1, 3, 7, 14, 30, 60, 60]);
  });

  it("gives each concept its own due time and the earliest one overall", () => {
    const { w, act } = setup();
    const lora = w.concept("LoRA");
    const loraEnc = w.encounter(lora, "s1");
    w.setTime(day(1));
    const attention = w.concept("Attention");
    w.encounter(attention, "s1");
    act(loraEnc, "marked_understood", day(2));
    const state = w.state();
    expect(dueAtOf(state, lora)).toBe(day(2) + 3 * DAY_MS);
    expect(dueAtOf(state, attention)).toBe(day(1) + DAY_MS);
    expect(nextDueAt(state)).toBe(day(2));
  });

  it("has no due time for muted concepts or an empty history", () => {
    const { w } = setup();
    const c = w.concept("LoRA");
    w.encounter(c, "s1");
    w.events.push(w.f.make("concept.muted", { concept_id: c }));
    expect(dueAtOf(w.state(), c)).toBeNull();
    expect(nextDueAt(w.state())).toBeNull();
  });
});
