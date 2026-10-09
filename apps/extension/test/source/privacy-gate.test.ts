import { describe, expect, it } from "vitest";
import { gateSource, type GateInput } from "../../src/lib/source/privacy-gate";
import { onPrivateByDefaultSite, sensitiveStated } from "../../src/lib/source/site-rules";
import type { SiteRule } from "../../src/lib/storage/settings";
import { world } from "../helpers";

const URL_ = "https://github.com/acme/secret";
const input = (o: Partial<GateInput> & { rules?: SiteRule[]; setup?: (w: ReturnType<typeof world>) => void } = {}): GateInput => {
  const w = world();
  o.setup?.(w);
  return { rules: o.rules ?? [], state: w.state(), sourceId: "github:acme/secret", url: URL_, privacy: "unknown", ...o };
};
const gate = (o: Parameters<typeof input>[0] = {}) => gateSource(input(o));

describe("the privacy gate", () => {
  it("lets a page through when nothing says it is private", () => {
    expect(gate()).toBe("normal");
    expect(gate({ privacy: "likely-public" })).toBe("normal");
  });

  it("asks before sending a page that looks private", () => {
    expect(gate({ privacy: "likely-private" })).toBe("ask");
  });

  it("asks about a page it cannot judge on a site that is private by default, and not elsewhere", () => {
    const notion = { url: "https://www.notion.so/Plan-0123456789abcdef0123456789abcdef", sourceId: "notion:x" };
    expect(gate({ ...notion, privacy: "unknown" })).toBe("ask");
    expect(gate({ ...notion, privacy: "likely-public" })).toBe("normal");
    expect(gate({ privacy: "unknown" })).toBe("normal");
  });

  it("treats a source marked sensitive as sensitive, whatever the page looks like", () => {
    const setup = (w: ReturnType<typeof world>) => w.source("github:acme/secret", "sensitive", "t", {}, true);
    expect(gate({ setup, privacy: "likely-public" })).toBe("sensitive");
  });

  it("treats the issues of a repository marked sensitive as sensitive", () => {
    const setup = (w: ReturnType<typeof world>) => w.source("github:acme/secret", "sensitive", "t", {}, true);
    expect(gate({ setup, sourceId: "github:acme/secret#4", url: `${URL_}/issues/4` })).toBe("sensitive");
  });

  it("follows what a site rule states about sensitivity, the more specific rule first", () => {
    expect(gate({ rules: [{ pattern: "github.com", sensitive: true }], privacy: "likely-public" })).toBe("sensitive");
    expect(gate({ rules: [{ pattern: "github.com", sensitive: false }], privacy: "unknown" })).toBe("normal");
    const rules = [
      { pattern: "github.com", sensitive: true },
      { pattern: "https://github.com/acme/open", sensitive: false },
    ];
    expect(gate({ rules, url: "https://github.com/acme/open", privacy: "unknown" })).toBe("normal");
    expect(gate({ rules, url: URL_, privacy: "likely-public" })).toBe("sensitive");
  });

  it('does not let a site-wide "fine" rule hide a page that says it is private', () => {
    expect(gate({ rules: [{ pattern: "github.com", sensitive: false }], privacy: "likely-private" })).toBe("ask");
    const decided = (w: ReturnType<typeof world>) => w.source("github:acme/secret", "normal", "t", {}, true);
    expect(gate({ rules: [{ pattern: "github.com", sensitive: false }], privacy: "likely-private", setup: decided })).toBe("normal");
  });

  it("does not count a rule that says nothing about sensitivity as an answer", () => {
    expect(gate({ rules: [{ pattern: "github.com", autoScan: true }], privacy: "likely-private" })).toBe("ask");
  });

  it("follows the reader's answer for this visit", () => {
    expect(gate({ privacy: "likely-private", choice: "local" })).toBe("sensitive");
    expect(gate({ privacy: "likely-private", choice: "anyway" })).toBe("normal");
  });

  it("does not ask again about a source the reader already said was fine, nor about its issues", () => {
    const setup = (w: ReturnType<typeof world>) => w.source("github:acme/secret", "normal", "t", {}, true);
    expect(gate({ setup, privacy: "likely-private" })).toBe("normal");
    expect(gate({ setup, privacy: "likely-private", sourceId: "github:acme/secret#4" })).toBe("normal");
  });

  it("still asks about a source that was only recorded automatically", () => {
    const setup = (w: ReturnType<typeof world>) => w.source("github:acme/secret", "normal");
    expect(gate({ setup, privacy: "likely-private" })).toBe("ask");
  });

  it("reads a hint or a choice it does not recognise as no hint and no choice", () => {
    const notion = { url: "https://www.notion.so/x", sourceId: "notion:x" };
    expect(gate({ ...notion, privacy: "bogus" as never, choice: "bogus" as never })).toBe("ask");
    expect(gate({ privacy: "likely-private", choice: "bogus" as never })).toBe("ask");
  });

  it("keeps a source sensitive even when a site rule says it is fine", () => {
    const setup = (w: ReturnType<typeof world>) => w.source("github:acme/secret", "sensitive", "t", {}, true);
    expect(gate({ setup, rules: [{ pattern: "github.com", sensitive: false }] })).toBe("sensitive");
  });
});

describe("what the site rules state", () => {
  it("reports an explicit yes or no from the most specific rule, and null when none states it", () => {
    const rules: SiteRule[] = [
      { pattern: "example.com", sensitive: true },
      { pattern: "https://example.com/docs", sensitive: false },
      { pattern: "other.org", autoScan: true },
    ];
    expect(sensitiveStated(rules, "https://example.com/a")).toBe(true);
    expect(sensitiveStated(rules, "https://example.com/docs/x")).toBe(false);
    expect(sensitiveStated(rules, "https://other.org/")).toBeNull();
    expect(sensitiveStated(rules, "not a url")).toBeNull();
  });

  it("knows the sites that are private by default, and their subdomains", () => {
    expect(onPrivateByDefaultSite("https://www.notion.so/x")).toBe(true);
    expect(onPrivateByDefaultSite("https://docs.google.com/document/d/1/edit")).toBe(true);
    expect(onPrivateByDefaultSite("https://acme.notion.site/x")).toBe(false);
    expect(onPrivateByDefaultSite("https://github.com/a/b")).toBe(false);
  });
});
