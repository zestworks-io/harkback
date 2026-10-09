// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  arxivHtmlUrl,
  arxivIdFromUrl,
  cleanUrl,
  detectPdfSource,
  detectSource,
  isArxivUrl,
  type PdfFacts,
} from "../../src/lib/source/source-id";

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

describe("arxivHtmlUrl", () => {
  it("maps arXiv PDF addresses to the HTML version", () => {
    expect(arxivHtmlUrl("https://arxiv.org/pdf/2106.09685")).toBe("https://arxiv.org/html/2106.09685");
    expect(arxivHtmlUrl("https://arxiv.org/pdf/2106.09685v2.pdf")).toBe("https://arxiv.org/html/2106.09685v2");
    expect(arxivHtmlUrl("https://arxiv.org/pdf/hep-th/9901001#page=3")).toBe("https://arxiv.org/html/hep-th/9901001");
  });

  it("leaves other addresses alone", () => {
    expect(arxivHtmlUrl("https://arxiv.org/html/2106.09685")).toBeNull();
    expect(arxivHtmlUrl("https://arxiv.org/abs/2106.09685")).toBeNull();
    expect(arxivHtmlUrl("https://example.com/pdf/2106.09685")).toBeNull();
  });
});

describe("detectPdfSource", () => {
  const facts = (over: Partial<PdfFacts> = {}): PdfFacts => ({
    url: "https://example.com/files/paper.pdf",
    title: "",
    firstPageText: "",
    ...over,
  });

  it("uses the arXiv id from the address or from the stamp on the first page", () => {
    expect(detectPdfSource(facts({ url: "https://arxiv.org/pdf/2106.09685v2" })).source_id).toBe("arxiv:2106.09685");
    const stamped = detectPdfSource(facts({ firstPageText: "Preprint. arXiv:2305.14314v1 [cs.LG] 23 May 2023" }));
    expect(stamped.source_id).toBe("arxiv:2305.14314");
    expect(stamped.ids.arxiv).toBe("2305.14314");
  });

  it("uses a DOI only when the text labels it as one", () => {
    expect(detectPdfSource(facts({ firstPageText: "Published online. DOI: 10.1145/3313831.3376727." })).source_id).toBe(
      "doi:10.1145/3313831.3376727",
    );
    expect(detectPdfSource(facts({ firstPageText: "https://doi.org/10.1000/XYZ-9)" })).source_id).toBe("doi:10.1000/xyz-9");
    expect(detectPdfSource(facts({ firstPageText: "see 10.1145/3313831.3376727 for details" })).source_id).toBe(
      "url:https://example.com/files/paper.pdf",
    );
    expect(detectPdfSource(facts({ metadataDoi: "doi:10.5555/AbC" })).source_id).toBe("doi:10.5555/abc");
  });

  it("falls back to the cleaned address, dropping tracking parameters", () => {
    const s = detectPdfSource(facts({ url: "https://example.com/p.pdf?utm_source=x&page=2#page=3" }));
    expect(s.source_id).toBe("url:https://example.com/p.pdf?page=2");
    expect(s.ids.url).toBe("https://example.com/p.pdf?page=2");
  });

  it("identifies a local file by its contents and never records its path", () => {
    const s = detectPdfSource(facts({ url: "file:///Users/me/Downloads/paper.pdf", contentHash: "ab12cd" }));
    expect(s.source_id).toBe("pdf:sha256:ab12cd");
    expect(s.ids).toEqual({});
    expect(JSON.stringify(s)).not.toContain("Users");
  });

  it("titles the source from the PDF metadata, else from the file name", () => {
    expect(detectPdfSource(facts({ title: "  Low-Rank\n Adaptation " })).title).toBe("Low-Rank Adaptation");
    expect(detectPdfSource(facts({ url: "https://example.com/a/My%20Paper_v2.pdf" })).title).toBe("My Paper_v2");
    expect(detectPdfSource(facts({ url: "file:///x/notes.pdf", contentHash: "1" })).title).toBe("notes");
  });
});
