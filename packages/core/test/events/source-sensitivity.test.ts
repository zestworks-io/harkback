import { describe, expect, it } from "vitest";
import { isChosenSource, isSensitiveSource, replay, sensitiveSourceIds } from "../../src";
import { ev } from "../helpers";

const seen = (source_id: string, sensitivity: "normal" | "sensitive", by_user?: boolean, ts = "2026-09-01T00:00:00Z") =>
  ev("source.seen", { source_id, ids: {}, title: source_id, license: "unknown", sensitivity, ...(by_user && { by_user }) }, { ts });

describe("a source the reader has decided about", () => {
  it("is remembered as decided, whichever way they decided", () => {
    const s = replay([seen("url:a", "normal", true), seen("url:b", "sensitive", true)]);
    expect(s.sources.get("url:a")?.chosen).toBe(true);
    expect(s.sources.get("url:b")?.chosen).toBe(true);
  });

  it("is not marked as decided when an automatic record made it normal", () => {
    expect(replay([seen("url:a", "normal")]).sources.get("url:a")?.chosen).toBeUndefined();
  });

  it("stays decided when a later automatic record arrives", () => {
    const s = replay([seen("url:a", "normal", true), seen("url:a", "normal", false, "2026-09-02T00:00:00Z")]);
    expect(s.sources.get("url:a")?.chosen).toBe(true);
  });
});

describe("a GitHub repository marked sensitive", () => {
  const state = replay([seen("github:acme/secret", "sensitive", true), seen("github:acme/open#3", "normal")]);

  it("makes its issues and pull requests sensitive too, recorded or not", () => {
    expect(isSensitiveSource(state, "github:acme/secret#5")).toBe(true);
    expect(isSensitiveSource(state, "github:acme/secret")).toBe(true);
  });

  it("does not reach another repository, or the other way round", () => {
    expect(isSensitiveSource(state, "github:acme/open#3")).toBe(false);
    expect(isSensitiveSource(state, "github:acme/secretive#1")).toBe(false);
    const issueOnly = replay([seen("github:acme/secret#5", "sensitive", true)]);
    expect(isSensitiveSource(issueOnly, "github:acme/secret")).toBe(false);
  });
});

describe("a paper the reader decided about", () => {
  it("counts as decided under its other id too", () => {
    const linked = ev("source.seen", {
      source_id: "arxiv:2401.00001",
      ids: { arxiv: "2401.00001", doi: "10.1/x" },
      title: "P",
      license: "unknown",
      sensitivity: "normal",
      by_user: true,
    });
    const state = replay([linked]);
    expect(isChosenSource(state, "arxiv:2401.00001")).toBe(true);
    expect(isChosenSource(state, "doi:10.1/x")).toBe(true);
    expect(isChosenSource(state, "doi:10.1/other")).toBe(false);
  });

  it("covers the issues of a repository the reader decided about", () => {
    const state = replay([seen("github:acme/open", "normal", true)]);
    expect(isChosenSource(state, "github:acme/open#9")).toBe(true);
    expect(isChosenSource(state, "github:acme/closed#9")).toBe(false);
  });
});

describe("an issue the reader said is fine", () => {
  it("is not sensitive even though its repository is", () => {
    const state = replay([
      seen("github:acme/secret", "sensitive", true),
      seen("github:acme/secret#4", "normal", true, "2026-09-02T00:00:00Z"),
    ]);
    expect(isSensitiveSource(state, "github:acme/secret#4")).toBe(false);
    expect(isSensitiveSource(state, "github:acme/secret#5")).toBe(true);
    expect(isSensitiveSource(state, "github:acme/secret")).toBe(true);
  });

  it("is still sensitive when it was only recorded automatically", () => {
    const state = replay([seen("github:acme/secret", "sensitive", true), seen("github:acme/secret#4", "normal")]);
    expect(isSensitiveSource(state, "github:acme/secret#4")).toBe(true);
  });

  it("is found by the one-pass list as well", () => {
    const state = replay([
      seen("github:acme/secret", "sensitive", true),
      seen("github:acme/secret#4", "normal", true, "2026-09-02T00:00:00Z"),
      seen("github:acme/secret#5", "normal"),
    ]);
    expect([...sensitiveSourceIds(state)].sort()).toEqual(["github:acme/secret", "github:acme/secret#5"]);
  });
});

describe("which came last, the repository's mark or the issue's answer", () => {
  it("lets an answer given after the repository was marked stand", () => {
    const state = replay([
      seen("github:acme/secret", "sensitive", true, "2026-09-01T00:00:00Z"),
      seen("github:acme/secret#4", "normal", true, "2026-09-02T00:00:00Z"),
    ]);
    expect(isSensitiveSource(state, "github:acme/secret#4")).toBe(false);
  });

  it("covers an issue answered earlier when the repository is marked afterwards", () => {
    const state = replay([
      seen("github:acme/secret#4", "normal", true, "2026-09-01T00:00:00Z"),
      seen("github:acme/secret", "sensitive", true, "2026-09-02T00:00:00Z"),
    ]);
    expect(isSensitiveSource(state, "github:acme/secret#4")).toBe(true);
    expect([...sensitiveSourceIds(state)].sort()).toEqual(["github:acme/secret", "github:acme/secret#4"]);
  });

  it("lets an answer stand against a repository that was only recorded automatically", () => {
    const state = replay([
      seen("github:acme/secret#4", "normal", true, "2026-09-01T00:00:00Z"),
      seen("github:acme/secret", "sensitive", false, "2026-09-02T00:00:00Z"),
    ]);
    expect(isSensitiveSource(state, "github:acme/secret#4")).toBe(false);
  });
});
