import { describe, expect, it } from "vitest";
import { allowed, senderKind } from "../src/lib/router";

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
});

describe("allowed", () => {
  it("keeps destructive requests to extension pages", () => {
    expect(allowed("delete-encounter", "page")).toBe(true);
    expect(allowed("delete-encounter", "content")).toBe(false);
    expect(allowed("backup-now", "content")).toBe(false);
    expect(allowed("reunions", "content")).toBe(true);
    expect(allowed("reunions", "page")).toBe(false);
  });
});
