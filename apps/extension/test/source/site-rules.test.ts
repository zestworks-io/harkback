import { describe, expect, it } from "vitest";
import { effectiveRule, mergeSiteRules, onPrivateByDefaultSite, sensitiveStated, withAutoScan } from "../../src/lib/source/site-rules";
import type { SiteRule } from "../../src/lib/storage/settings";

describe("a host name written with a trailing dot", () => {
  it("is matched by the rules for the same site", () => {
    const rules: SiteRule[] = [{ pattern: "example.com", sensitive: true, autoScan: true }];
    expect(sensitiveStated(rules, "https://mail.example.com./inbox")).toBe(true);
    expect(effectiveRule(rules, "https://example.com./").autoScan).toBe(true);
    expect(onPrivateByDefaultSite("https://www.notion.so./page")).toBe(true);
    expect(sensitiveStated([{ pattern: "https://example.com/private", sensitive: true }], "https://example.com./private/x")).toBe(true);
  });
});

describe("merging the site rules a settings page saves with those saved elsewhere meanwhile", () => {
  const scan: SiteRule = { pattern: "arxiv.org", autoScan: true };

  it("keeps a rule a page added while the settings page was open", () => {
    const remembered: SiteRule = { pattern: "mail.example.com", sensitive: true };
    expect(mergeSiteRules([scan], [scan, { pattern: "github.com", autoScan: true }], [scan, remembered])).toEqual([
      scan,
      { pattern: "github.com", autoScan: true },
      remembered,
    ]);
  });

  it("takes the other side's version of a rule this page left alone", () => {
    expect(mergeSiteRules([scan], [scan], [{ ...scan, sensitive: true }])).toEqual([{ ...scan, sensitive: true }]);
  });

  it("drops a rule removed elsewhere that this page left alone, and keeps one removed here", () => {
    expect(mergeSiteRules([scan], [scan], [])).toEqual([]);
    expect(mergeSiteRules([scan], [], [scan])).toEqual([]);
  });

  it("keeps this page's edit when both changed a rule, but never loses a sensitive mark made elsewhere", () => {
    expect(mergeSiteRules([scan], [{ ...scan, autoScan: false }], [{ ...scan, disabled: true }])).toEqual([{ ...scan, autoScan: false }]);
    expect(mergeSiteRules([scan], [{ ...scan, autoScan: false }], [{ ...scan, sensitive: true }])).toEqual([
      { ...scan, autoScan: false, sensitive: true },
    ]);
    expect(mergeSiteRules([scan], [], [{ ...scan, sensitive: true }])).toEqual([{ ...scan, sensitive: true }]);
  });

  it("matches rules by site, however the pattern is written", () => {
    expect(mergeSiteRules([], [{ pattern: "*.Example.com" }], [{ pattern: "example.com", sensitive: true }])).toEqual([
      { pattern: "*.Example.com", sensitive: true },
    ]);
  });
});

describe("turning a site on", () => {
  it("adds the switch to the site's own rule and keeps its other settings and the other rules", () => {
    const rules: SiteRule[] = [
      { pattern: "example.com", sensitive: true },
      { pattern: "https://example.com/docs", autoScan: false },
    ];
    expect(withAutoScan(rules, "example.com")).toEqual([
      { pattern: "example.com", sensitive: true, autoScan: true },
      { pattern: "https://example.com/docs", autoScan: false },
    ]);
    expect(rules[0]).toEqual({ pattern: "example.com", sensitive: true });
  });

  it("adds a rule for a site that has none, even when a broader rule covers it", () => {
    expect(withAutoScan([{ pattern: "github.io", disabled: false }], "me.github.io")).toEqual([
      { pattern: "github.io", disabled: false },
      { pattern: "me.github.io", autoScan: true },
    ]);
  });
});
