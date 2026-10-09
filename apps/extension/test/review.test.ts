import { DAY_MS } from "@harkback/core";
import type { Action } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import { firstMemory, nextMemory, scheduledDays } from "../src/lib/fsrs";
import { dueAtOf, nextDueAt, reviewQueue } from "../src/lib/review";
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

  it("makes an unanswered concept due one day after it was explained", () => {
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
      answers: 0,
    });
  });

  it("makes a forgotten concept due one day after it was answered", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    act(w.encounter(c, "s1"), "review_again", day(2));
    expect(reviewQueue(w.state(), day(2) + DAY_MS - 1)).toEqual([]);
    expect(reviewQueue(w.state(), day(3))[0]).toMatchObject({ conceptId: c, understanding: "confused" });
  });

  it("waits longer after better answers", () => {
    const due = (action: Action) => {
      const { w, act } = setup();
      const c = w.concept("LoRA");
      act(w.encounter(c, "s1"), action, day(0));
      return dueAtOf(w.state(), c)! - day(0);
    };
    expect([due("review_again"), due("review_hard"), due("review_good"), due("review_easy")]).toEqual([1, 1, 5, 54].map((n) => n * DAY_MS));
  });

  it("counts the older marks as answers: understood is Good and confused is Again", () => {
    const { w, act } = setup();
    const a = w.concept("A");
    const b = w.concept("B");
    const c = w.concept("C");
    // Looked up on day 0 and marked in an earlier review, a day or more later.
    const ea = w.encounter(a, "s1");
    const eb = w.encounter(b, "s1");
    const ec = w.encounter(c, "s1");
    act(ea, "marked_understood", day(1));
    act(eb, "reunion_recalled", day(1));
    act(ec, "marked_confused", day(1));
    const s = w.state();
    expect(dueAtOf(s, a)).toBe(day(6));
    expect(dueAtOf(s, b)).toBe(day(6));
    expect(dueAtOf(s, c)).toBe(day(2));
  });

  it("does not take a mark on the explain card, made right after the look-up, as a review", () => {
    const { w, act } = setup();
    const a = w.concept("A");
    const b = w.concept("B");
    const ea = w.encounter(a, "s1");
    const eb = w.encounter(b, "s1");
    act(ea, "marked_understood", day(0) + 60_000);
    act(eb, "marked_confused", day(0) + 60_000);
    const s = w.state();
    // Still unanswered: due a day after the look-up, as if nothing had been marked.
    expect(dueAtOf(s, a)).toBe(day(1));
    expect(dueAtOf(s, b)).toBe(day(1));
    expect(reviewQueue(s, day(1))[0]!.answers).toBe(0);
  });

  it("treats a recalled reunion like a Good answer", () => {
    const due = (action: Action) => {
      const { w, act } = setup();
      const c = w.concept("LoRA");
      const e = w.encounter(c, "s1");
      act(e, "review_good", day(1));
      act(e, action, day(3));
      return dueAtOf(w.state(), c);
    };
    expect(due("reunion_recalled")).toBe(due("review_good"));
    expect(due("reunion_recalled")).toBeGreaterThan(day(3) + DAY_MS);
  });

  it("spaces a term further apart each time it is remembered, following the memory model", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "review_good", day(0));
    expect(reviewQueue(w.state(), day(4))).toEqual([]);
    expect(reviewQueue(w.state(), day(5))).toHaveLength(1);
    act(e, "review_good", day(5));
    const second = scheduledDays(nextMemory(firstMemory(3), 3, 5), 0.9);
    expect(second).toBeGreaterThan(5);
    expect(dueAtOf(w.state(), c)).toBe(day(5) + second * DAY_MS);
    expect(reviewQueue(w.state(), day(5 + second) - 1)).toEqual([]);
    expect(reviewQueue(w.state(), day(5 + second))).toHaveLength(1);
  });

  it("brings terms back sooner at a higher target recall", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "review_good", day(0));
    act(e, "review_good", day(3));
    expect(dueAtOf(w.state(), c, 0.95)!).toBeLessThan(dueAtOf(w.state(), c, 0.9)!);
    expect(dueAtOf(w.state(), c, 0.8)!).toBeGreaterThan(dueAtOf(w.state(), c, 0.9)!);
  });

  it("falls back after forgetting", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "review_good", day(0));
    act(e, "review_good", day(3));
    const grown = dueAtOf(w.state(), c)! - day(3);
    act(e, "review_again", day(20));
    act(e, "review_good", day(21));
    expect(dueAtOf(w.state(), c)! - day(21)).toBeLessThan(grown);
  });

  it("ignores follow-ups and other actions that say nothing about remembering", () => {
    const { w, act } = setup();
    const c = w.concept("LoRA");
    const e = w.encounter(c, "s1");
    act(e, "review_good", day(0));
    act(e, "followed_up", day(2));
    act(e, "reunion_compare", day(2));
    expect(dueAtOf(w.state(), c)).toBe(day(5));
  });

  it("gives each item what every answer would schedule, for the buttons", () => {
    const { w } = setup();
    w.encounter(w.concept("LoRA"), "s1");
    const [item] = reviewQueue(w.state(), day(1));
    expect(item!.previews).toEqual({ 1: 1, 2: 1, 3: 5, 4: 54 });
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
    act(w.encounter(overdue, "s1"), "review_good", day(0));
    const fresh = w.concept("Fresh");
    w.setTime(day(9));
    w.encounter(fresh, "s1");
    const confused = w.concept("Confused");
    act(w.encounter(confused, "s1"), "review_again", day(9));
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
  it("gives each concept its own due time and the earliest one overall", () => {
    const { w, act } = setup();
    const lora = w.concept("LoRA");
    const loraEnc = w.encounter(lora, "s1");
    w.setTime(day(1));
    const attention = w.concept("Attention");
    w.encounter(attention, "s1");
    act(loraEnc, "review_good", day(2));
    const state = w.state();
    expect(dueAtOf(state, lora)).toBe(day(2) + 5 * DAY_MS);
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

describe("reviewQueue order by prerequisites", () => {
  function chain() {
    const { w, act } = setup();
    const ids = { lora: w.concept("LoRA"), rank: w.concept("Matrix rank"), svd: w.concept("SVD") };
    const edge = (from: string, to: string, confidence = 0.8) =>
      w.events.push(w.f.make("edge.proposed", { from, to, rel: "prerequisite", source: "llm_explain", confidence, evidence: {} }));
    return { w, act, ids, edge };
  }
  const order = (w: ReturnType<typeof setup>["w"], now = day(10)) => reviewQueue(w.state(), now).map((i) => i.name);

  it("puts a due prerequisite before the term that builds on it, even when that one is more overdue", () => {
    const { w, ids, edge } = chain();
    w.encounter(ids.lora, "s1"); // looked up first, so more overdue
    w.setTime(day(2));
    w.encounter(ids.rank, "s1");
    edge(ids.lora, ids.rank);
    expect(order(w)).toEqual(["Matrix rank", "LoRA"]);
    expect(reviewQueue(w.state(), day(10)).map((i) => i.unlocks)).toEqual([["LoRA"], []]);
  });

  it("follows a chain through a term that is not due", () => {
    const { w, act, ids, edge } = chain();
    w.encounter(ids.lora, "s1");
    const rank = w.encounter(ids.rank, "s1");
    w.setTime(day(1));
    w.encounter(ids.svd, "s1");
    act(rank, "review_easy", day(2)); // rank is not due on day 10 any more
    edge(ids.lora, ids.rank);
    edge(ids.rank, ids.svd);
    expect(order(w, day(8))).toEqual(["SVD", "LoRA"]);
  });

  it("ignores rejected or unlikely relations and unrelated terms", () => {
    const { w, ids, edge } = chain();
    w.encounter(ids.lora, "s1");
    w.setTime(day(2));
    w.encounter(ids.rank, "s1");
    edge(ids.lora, ids.rank, 0.1);
    expect(order(w)).toEqual(["LoRA", "Matrix rank"]);
  });

  it("keeps the usual order for terms in a cycle", () => {
    const { w, ids, edge } = chain();
    w.encounter(ids.lora, "s1");
    w.setTime(day(2));
    w.encounter(ids.rank, "s1");
    edge(ids.lora, ids.rank);
    edge(ids.rank, ids.lora);
    expect(order(w)).toEqual(["LoRA", "Matrix rank"]);
  });
});
