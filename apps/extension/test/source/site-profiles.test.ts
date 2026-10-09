// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { extractPage } from "../../src/lib/source/extract";
import { profileFor } from "../../src/lib/source/site-profiles";
import { detectSource } from "../../src/lib/source/source-id";

const page = (head: string, body: string) =>
  new DOMParser().parseFromString(`<html><head>${head}</head><body>${body}</body></html>`, "text/html");
const idOf = (url: string) => profileFor(url)?.sourceId() ?? null;

describe("GitHub profile: which pages", () => {
  it("covers a repository's home page, its issues and its pull requests", () => {
    for (const url of [
      "https://github.com/octo/hello",
      "https://github.com/octo/hello/issues/12",
      "https://github.com/octo/hello/pull/7",
      "https://github.com/octo/hello/pull/7/files",
    ])
      expect(profileFor(url), url).not.toBeNull();
  });

  it("leaves everything else on GitHub, and other hosts, to the generic path", () => {
    for (const url of [
      "https://github.com/",
      "https://github.com/octo",
      "https://github.com/settings/profile",
      "https://github.com/orgs/octo/people",
      "https://github.com/account/billing",
      "https://github.com/copilot/chat",
      "https://github.com/dashboard/x",
      "https://github.com/users/octo",
      "https://github.com/stars/octo",
      "https://github.com/octo/hello/issues/new",
      "https://github.com/octo/hello/blob/main/src/a.ts",
      "https://github.com/octo/hello/issues",
      "https://gist.github.com/octo/abcdef",
      "https://notgithub.com/octo/hello",
      "not a url",
    ])
      expect(profileFor(url), url).toBeNull();
  });
});

describe("GitHub profile: source ids", () => {
  it("names a repository by owner and name, whatever the case, query or anchor", () => {
    for (const url of [
      "https://github.com/Octo/Hello",
      "https://github.com/octo/hello/",
      "https://github.com/octo/hello?tab=readme-ov-file",
      "https://github.com/octo/hello#installation",
      "https://www.github.com/octo/hello",
      "https://github.com/octo/hello.git",
    ])
      expect(idOf(url), url).toBe("github:octo/hello");
  });

  it("names an issue or a pull request by its number, whichever tab of it is open", () => {
    expect(idOf("https://github.com/octo/hello/issues/12")).toBe("github:octo/hello#12");
    expect(idOf("https://github.com/octo/hello/issues/12#issuecomment-99")).toBe("github:octo/hello#12");
    expect(idOf("https://github.com/Octo/Hello/pull/7/files")).toBe("github:octo/hello#7");
    expect(idOf("https://github.com/octo/hello/pull/7/commits?x=1")).toBe("github:octo/hello#7");
  });
});

describe("GitHub profile: where the text is", () => {
  it("reads a repository's README and not the page chrome around it", () => {
    const doc = page(
      "",
      `<nav>Navigation Pull requests Issues</nav><main><article class="markdown-body"><h1>Hello</h1><p>A README.</p></article><aside>About Releases</aside></main>`,
    );
    const root = profileFor("https://github.com/octo/hello")!.root(doc);
    expect(root?.classList.contains("markdown-body")).toBe(true);
  });

  it("reads the whole conversation of an issue or pull request", () => {
    const doc = page(
      "",
      `<header>Search</header><div id="discussion_bucket"><div class="js-discussion"><div class="markdown-body">First</div><div class="markdown-body">Reply</div></div></div>`,
    );
    const root = profileFor("https://github.com/octo/hello/issues/12")!.root(doc);
    expect(root?.textContent).toContain("First");
    expect(root?.textContent).toContain("Reply");
    expect(root?.textContent).not.toContain("Search");
  });

  it("passes over a README element that has no text, so the generic search can find the page's text", () => {
    const doc = page("", `<article class="markdown-body"> </article><main><p>Real text</p></main>`);
    expect(profileFor("https://github.com/octo/hello")!.root(doc)).toBeNull();
  });

  it("finds nothing when the page no longer has the expected structure", () => {
    expect(profileFor("https://github.com/octo/hello")!.root(page("", "<div>Changed</div>"))).toBeNull();
  });
});

describe("GitHub profile: privacy hints", () => {
  const privacy = (url: string, head: string, body = "") => profileFor(url)!.privacy(new URL(url), page(head, body));
  const url = "https://github.com/octo/hello";

  it("believes the repository's own public flag", () => {
    expect(privacy(url, '<meta name="octolytics-dimension-repository_public" content="false">')).toBe("likely-private");
    expect(privacy(url, '<meta name="octolytics-dimension-repository_public" content="true">')).toBe("likely-public");
  });

  it("falls back to the Private / Public badge in the header", () => {
    expect(privacy(url, "", '<div id="repository-container-header"><span class="Label">Private</span></div>')).toBe("likely-private");
    expect(privacy(url, "", '<div id="repository-container-header"><span class="Label">Public</span></div>')).toBe("likely-public");
  });

  it("does not guess when there is no hint", () => {
    expect(privacy(url, "")).toBe("unknown");
    expect(privacy(url, "", '<div id="repository-container-header"><span class="Label">Archived</span></div>')).toBe("unknown");
  });
});

describe("detectSource with a profile", () => {
  it("uses the profile's id and keeps the cleaned address and the page title", () => {
    const doc = page('<meta property="og:title" content="Fix the parser by octo · Pull Request #7 · octo/hello">', "");
    const s = detectSource("https://github.com/Octo/Hello/pull/7/files?utm_source=x#diff-1", doc);
    expect(s.source_id).toBe("github:octo/hello#7");
    expect(s.ids.url).toBe("https://github.com/Octo/Hello/pull/7/files");
    expect(s.title).toBe("Fix the parser by octo · Pull Request #7 · octo/hello");
  });

  it("keeps the generic id for pages no profile covers", () => {
    expect(detectSource("https://example.com/a", page("", "")).source_id).toBe("url:https://example.com/a");
  });
});

describe("extractPage with a profile", () => {
  it("scans only the profile's root", () => {
    const doc = page(
      "",
      `<nav>Navigation chrome</nav><article class="markdown-body"><p>Gradient descent minimises a loss.</p></article><footer>Terms Privacy</footer>`,
    );
    expect(extractPage(doc, "https://github.com/octo/hello").text).toBe("Gradient descent minimises a loss.");
  });

  it("falls back to the generic root when the profile finds nothing", () => {
    const doc = page("", `<main><p>Gradient descent minimises a loss.</p></main>`);
    expect(extractPage(doc, "https://github.com/octo/hello").text).toContain("Gradient descent");
  });
});
