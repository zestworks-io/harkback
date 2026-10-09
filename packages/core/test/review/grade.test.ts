import { ACTIONS } from "@harkback/spec";
import { describe, expect, it } from "vitest";
import { gradeOf, REVIEW_ACTIONS, replay } from "../../src";
import { action, concept, encounter } from "../helpers";

describe("gradeOf", () => {
  it("gives the four review answers grades 1 to 4", () => {
    expect(REVIEW_ACTIONS.map(gradeOf)).toEqual([1, 2, 3, 4]);
  });

  it("reads the older marks as Good and Again", () => {
    expect(gradeOf("marked_understood")).toBe(3);
    expect(gradeOf("reunion_recalled")).toBe(3);
    expect(gradeOf("marked_confused")).toBe(1);
  });

  it("says nothing about remembering for follow-ups and comparisons", () => {
    expect(gradeOf("followed_up")).toBeNull();
    expect(gradeOf("reunion_reexplain")).toBeNull();
    expect(gradeOf("reunion_compare")).toBeNull();
  });

  it("covers every action the spec allows", () => {
    for (const a of ACTIONS) expect([1, 2, 3, 4, null]).toContain(gradeOf(a));
  });
});

describe("replay and review answers", () => {
  it("marks an encounter as ever confused after Again, as it does after the older confused mark", () => {
    const events = [concept(1, "LoRA"), encounter(10, 1, "src"), action(10, "review_again")];
    expect(replay(events).encounters.values().next().value!.everConfused).toBe(true);
    const good = [concept(1, "LoRA"), encounter(10, 1, "src"), action(10, "review_good")];
    expect(replay(good).encounters.values().next().value!.everConfused).toBe(false);
    const hard = [concept(1, "LoRA"), encounter(10, 1, "src"), action(10, "review_hard")];
    expect(replay(hard).encounters.values().next().value!.everConfused).toBe(false);
  });

  it("keeps a review answer on the encounter as its last action", () => {
    const enc = replay([concept(1, "LoRA"), encounter(10, 1, "src"), action(10, "review_easy")])
      .encounters.values()
      .next().value!;
    expect(enc.lastAction).toBe("review_easy");
    expect(enc.actions.map((a) => a.action)).toEqual(["review_easy"]);
  });
});
