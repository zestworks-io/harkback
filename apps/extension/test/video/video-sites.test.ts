import { describe, expect, it } from "vitest";
import {
  addSuggestedSites,
  addVideoSites,
  effectiveRule,
  hostPermissionPatterns,
  normalizePattern,
  SUGGESTED_RESEARCH_SITES,
  VIDEO_SITES,
} from "../../src/lib/source/site-rules";
import type { SiteRule } from "../../src/lib/storage/settings";

describe("video sites", () => {
  it("are valid patterns that cover the watch page", () => {
    for (const p of VIDEO_SITES) {
      expect(normalizePattern(p)).toBe(p);
      expect(hostPermissionPatterns(p)).toEqual([`*://${p}/*`, `*://*.${p}/*`]);
    }
    const rules: SiteRule[] = [];
    expect(addVideoSites(rules)).toBe(VIDEO_SITES.length);
    expect(effectiveRule(rules, "https://www.youtube.com/watch?v=dQw4w9WgXcQ").autoScan).toBe(true);
  });

  it("are not scanned until added, and are not among the research sites", () => {
    expect(effectiveRule([], "https://www.youtube.com/watch?v=dQw4w9WgXcQ").autoScan).toBe(false);
    for (const p of VIDEO_SITES) expect(SUGGESTED_RESEARCH_SITES).not.toContain(p);
    const rules: SiteRule[] = [];
    addSuggestedSites(rules);
    expect(effectiveRule(rules, "https://www.youtube.com/watch?v=dQw4w9WgXcQ").autoScan).toBe(false);
  });

  it("add nothing twice and leave a rule the reader already has alone", () => {
    const rules: SiteRule[] = [{ pattern: "YouTube.com", sensitive: true }];
    expect(addVideoSites(rules)).toBe(0);
    expect(rules).toEqual([{ pattern: "YouTube.com", sensitive: true }]);
  });

  it("keep a sensitive rule in force for a video", () => {
    const rules: SiteRule[] = [{ pattern: "youtube.com", autoScan: true, sensitive: true }];
    expect(effectiveRule(rules, "https://www.youtube.com/watch?v=dQw4w9WgXcQ").sensitive).toBe(true);
  });
});
