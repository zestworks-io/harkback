// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arxivIdFromUrl, cleanUrl, detectSource, isArxivUrl } from "../src/lib/source-id";

const load = (name: string) => new DOMParser().parseFromString(readFileSync(`apps/extension/fixtures/${name}`, "utf8"), "text/html");
const html = (head: string) => new DOMParser().parseFromString(`<html><head>${head}</head><body></body></html>`, "text/html");

describe("cleanUrl", () => {
  it("drops the hash and tracking parameters and keeps the rest", () => {
    expect(cleanUrl("https://Example.com/a?utm_source=x&id=3&fbclid=y#top")).toBe("https://example.com/a?id=3");
    expect(cleanUrl("https://example.com/a?utm_medium=feed")).toBe("https://example.com/a");
  });
});

describe("arXiv ids", () => {
  it("reads new and old style ids and strips the version", () => {
    expect(arxivIdFromUrl("https://arxiv.org/html/2106.09685v2#S1")).toBe("2106.09685");
    expect(arxivIdFromUrl("https://arxiv.org/abs/hep-th/9901001v1")).toBe("hep-th/9901001");
    expect(arxivIdFromUrl("https://example.com/2106.09685")).toBeNull();
    expect(isArxivUrl("https://www.arxiv.org/abs/1")).toBe(true);
    expect(isArxivUrl("https://notarxiv.org/")).toBe(false);
  });
});

describe("detectSource", () => {
  it("prefers the arXiv id from the URL", () => {
    const s = detectSource("https://arxiv.org/html/2106.09685v2#S1", load("arxiv-2106.09685.html"));
    expect(s).toEqual({
      source_id: "arxiv:2106.09685",
      ids: { url: "https://arxiv.org/html/2106.09685v2", arxiv: "2106.09685" },
      title: "LoRA: Low-Rank Adaptation of Large Language Models",
      license: "unknown",
    });
  });

  it("uses meta ids, then the canonical link, then the cleaned URL", () => {
    expect(detectSource("https://pub.example.com/x", html('<meta name="citation_doi" content="10.1000/ABC">')).source_id).toBe(
      "doi:10.1000/abc",
    );
    expect(detectSource("https://mirror.example.com/x", html('<meta name="citation_arxiv_id" content="2106.09685v3">')).source_id).toBe(
      "arxiv:2106.09685",
    );
    const blog = detectSource("https://blog.example.com/posts/adapters?utm_source=x&id=3#top", load("blog.html"));
    expect(blog.source_id).toBe("url:https://blog.example.com/posts/adapters");
    expect(blog.ids).toEqual({ url: "https://blog.example.com/posts/adapters?id=3" });
    expect(blog.title).toBe("Understanding adapters | Example Blog");
    expect(detectSource("https://plain.example.com/p?utm_campaign=z", html("<title>Plain</title>")).source_id).toBe(
      "url:https://plain.example.com/p",
    );
  });
});
