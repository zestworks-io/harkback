import { describe, expect, it } from "vitest";
import { identityKey, Matcher, matcherEntriesFromState, replay } from "../../src";
import { concept } from "../helpers";
import { PAGES, PAIRS, type PageCase, type PairCase } from "./eval-cases";

const pairPasses = (c: PairCase): boolean => (identityKey(c.a) === identityKey(c.b)) === c.same;

function pageHits(c: PageCase): string[] {
  const matcher = new Matcher(matcherEntriesFromState(replay(c.names.map((name, i) => concept(i + 1, name)))));
  return matcher.scan(c.text).map((h) => h.text);
}
const pagePasses = (c: PageCase): boolean => JSON.stringify(pageHits(c)) === JSON.stringify(c.hits);

describe("matcher evaluation", () => {
  it("never merges names that are different terms", () => {
    const merged = PAIRS.filter((c) => !c.same && !pairPasses(c)).map((c) => `${c.lang}: ${c.a} / ${c.b}`);
    expect(merged).toEqual([]);
  });

  it("never underlines text that is not the term", () => {
    const wrong = PAGES.filter((c) => c.hits.length === 0 && !pagePasses(c)).map((c) => `${c.lang}: ${c.text}`);
    expect(wrong).toEqual([]);
  });

  it("handles every case that is not marked as a known gap", () => {
    const failing = [
      ...PAIRS.filter((c) => !c.gap && !pairPasses(c)).map((c) => `pair ${c.lang}: ${c.a} / ${c.b}`),
      ...PAGES.filter((c) => !c.gap && !pagePasses(c)).map((c) => `page ${c.lang}: ${c.text}`),
    ];
    expect(failing).toEqual([]);
  });

  it("has no known gap that now passes", () => {
    const closed = [...PAIRS.filter((c) => c.gap && pairPasses(c)), ...PAGES.filter((c) => c.gap && pagePasses(c))];
    expect(closed.length, "a known gap now passes: remove its `gap` mark").toBe(0);
  });
});
