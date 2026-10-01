import { describe, expect, it } from "vitest";
import { allowed, readerSource, senderKind } from "../src/lib/sender-auth";

const ID = "abcdefghijklmnopabcdefghijklmnop";
const ORIGIN = `chrome-extension://${ID}`;

describe("senderKind", () => {
  it("accepts only this extension's contexts", () => {
    expect(senderKind({ id: "other", tab: { id: 1 }, url: "https://a.com/" }, ID, ORIGIN)).toBeNull();
    expect(senderKind({ id: ID, tab: { id: 1 }, url: "https://a.com/" }, ID, ORIGIN)).toBe("content");
    expect(senderKind({ id: ID, tab: { id: 1 }, url: `${ORIGIN}/history.html` }, ID, ORIGIN)).toBe("page");
    expect(senderKind({ id: ID, url: `${ORIGIN}/options.html` }, ID, ORIGIN)).toBe("page");
    expect(senderKind({ id: ID, url: `${ORIGIN}.evil.com/` }, ID, ORIGIN)).toBeNull();
    expect(senderKind({ id: ID }, ID, ORIGIN)).toBeNull();
  });

  it("tells the PDF reader page apart from other extension pages", () => {
    const reader = `${ORIGIN}/reader.html?src=${encodeURIComponent("https://a.com/p.pdf")}`;
    expect(senderKind({ id: ID, tab: { id: 1 }, url: reader }, ID, ORIGIN)).toBe("reader");
    expect(senderKind({ id: ID, tab: { id: 1 }, url: `${ORIGIN}/reader.html` }, ID, ORIGIN)).toBe("reader");
    expect(senderKind({ id: ID, tab: { id: 1 }, url: `${ORIGIN}/reader.html.evil` }, ID, ORIGIN)).toBe("page");
    // A web page cannot pass as the reader by naming its path the same.
    expect(senderKind({ id: ID, tab: { id: 1 }, url: "https://a.com/reader.html?src=x" }, ID, ORIGIN)).toBe("content");
  });
});

describe("readerSource", () => {
  const url = (src: string) => `${ORIGIN}/reader.html?src=${encodeURIComponent(src)}`;
  it("gives the address of the PDF being read", () => {
    expect(readerSource(url("https://a.com/p.pdf?x=1"))).toBe("https://a.com/p.pdf?x=1");
    expect(readerSource(url("file:///Users/me/p.pdf"))).toBe("file:///Users/me/p.pdf");
  });
  it("refuses anything that is not a web or file address", () => {
    expect(readerSource(url("javascript:alert(1)"))).toBe("");
    expect(readerSource(url("chrome-extension://abc/x.pdf"))).toBe("");
    expect(readerSource(`${ORIGIN}/reader.html`)).toBe("");
    expect(readerSource(undefined)).toBe("");
  });
});

describe("allowed", () => {
  it("keeps destructive requests to extension pages", () => {
    expect(allowed("delete-encounter", "page")).toBe(true);
    expect(allowed("delete-encounter", "content")).toBe(false);
    expect(allowed("backup-now", "content")).toBe(false);
    expect(allowed("review-answer", "page")).toBe(true);
    expect(allowed("review-answer", "content")).toBe(false);
    expect(allowed("review-answer", "reader")).toBe(false);
    for (const type of ["merge-concepts", "add-alias", "reject-edge", "set-muted"] as const) {
      expect(allowed(type, "page")).toBe(true);
      expect(allowed(type, "content")).toBe(false);
      expect(allowed(type, "reader")).toBe(false);
    }
    expect(allowed("reunions", "content")).toBe(true);
    expect(allowed("reunions", "page")).toBe(false);
  });

  it("gives the reader page the same rights as a content script", () => {
    expect(allowed("reunions", "reader")).toBe(true);
    expect(allowed("page-info", "reader")).toBe(true);
    expect(allowed("delete-encounter", "reader")).toBe(false);
    expect(allowed("backup-now", "reader")).toBe(false);
  });
});
