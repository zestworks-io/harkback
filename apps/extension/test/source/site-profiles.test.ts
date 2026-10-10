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

  it("reads a label that starts with Private or Public, such as an archived repository", () => {
    const badge = (text: string) => `<div id="repository-container-header"><span class="Label">${text}</span></div>`;
    expect(privacy(url, "", badge("Private archive"))).toBe("likely-private");
    expect(privacy(url, "", badge("Public archive"))).toBe("likely-public");
    expect(privacy(url, "", badge("Privately owned"))).toBe("unknown");
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

const NOTION_ID = "0123456789abcdef0123456789abcdef";

describe("Notion profile", () => {
  it("covers a page however its address is written, and nothing else on notion.so", () => {
    for (const url of [
      `https://www.notion.so/Plan-for-Q4-${NOTION_ID}`,
      `https://notion.so/${NOTION_ID}`,
      `https://www.notion.so/acme/Plan-for-Q4-${NOTION_ID}?pvs=4`,
      `https://acme.notion.site/Plan-${NOTION_ID}`,
      `https://www.notion.so/acme/${NOTION_ID.slice(0, 8)}-${NOTION_ID.slice(8, 12)}-${NOTION_ID.slice(12, 16)}-${NOTION_ID.slice(16, 20)}-${NOTION_ID.slice(20)}`,
    ])
      expect(profileFor(url), url).not.toBeNull();
    for (const url of [
      "https://www.notion.so/",
      "https://www.notion.so/login",
      "https://www.notion.so/product/ai",
      "https://notion.so.evil.com/" + NOTION_ID,
      "https://example.com/" + NOTION_ID,
    ])
      expect(profileFor(url), url).toBeNull();
  });

  it("names a page by its id alone, whatever its title, workspace, query or capitalisation", () => {
    for (const url of [
      `https://www.notion.so/Plan-for-Q4-${NOTION_ID}`,
      `https://www.notion.so/Renamed-title-${NOTION_ID.toUpperCase()}#block`,
      `https://notion.so/acme/${NOTION_ID}?v=1&pvs=4`,
      `https://acme.notion.site/${NOTION_ID}`,
    ])
      expect(idOf(url), url).toBe(`notion:${NOTION_ID}`);
  });

  it("reads the page content and not the sidebar", () => {
    const doc = page(
      "",
      `<div class="notion-sidebar">Workspaces Teamspaces</div><div class="notion-frame"><div class="notion-page-content"><div>Q4 goals</div></div></div>`,
    );
    const root = profileFor(`https://www.notion.so/${NOTION_ID}`)!.root(doc);
    expect(root?.textContent).toBe("Q4 goals");
  });

  it("finds nothing when the page no longer has the expected structure", () => {
    expect(profileFor(`https://www.notion.so/${NOTION_ID}`)!.root(page("", "<div>Changed</div>"))).toBeNull();
  });

  it("calls a published page public, and leaves a workspace page to the reader", () => {
    const hint = (url: string) => profileFor(url)!.privacy(new URL(url), page("", ""));
    expect(hint(`https://acme.notion.site/${NOTION_ID}`)).toBe("likely-public");
    expect(hint(`https://www.notion.so/${NOTION_ID}`)).toBe("unknown");
  });

  it("names the page opened in a peek, not the database behind it", () => {
    const peeked = "abcdefabcdefabcdefabcdefabcdefab";
    expect(idOf(`https://www.notion.so/acme/Tasks-${NOTION_ID}?v=1234&p=${peeked}&pm=s`)).toBe(`notion:${peeked}`);
    expect(idOf(`https://www.notion.so/Tasks-${NOTION_ID}?p=not-an-id`)).toBe(`notion:${NOTION_ID}`);
  });

  it("reads the page in the peek and not the page behind it", () => {
    const doc = page(
      "",
      `<div class="notion-frame"><div class="notion-page-content">Tasks database</div></div>
       <div class="notion-peek-renderer"><div class="notion-page-content">The opened task</div></div>`,
    );
    expect(profileFor(`https://www.notion.so/${NOTION_ID}?p=abcdefabcdefabcdefabcdefabcdefab`)!.root(doc)?.textContent).toBe(
      "The opened task",
    );
  });

  it("does not take something that only looks like a page address for a page", () => {
    for (const url of [
      `https://www.notion.so/invite/${NOTION_ID}`,
      `https://www.notion.so/${NOTION_ID}0123456789`,
      `https://www.notion.so/deadbeef-plan`,
      `https://www.notion.so/${NOTION_ID}/settings`,
    ])
      expect(profileFor(url), url).toBeNull();
  });

  it("accepts a trailing slash", () => {
    expect(idOf(`https://www.notion.so/Plan-${NOTION_ID}/`)).toBe(`notion:${NOTION_ID}`);
  });
});

describe("Google Docs profile", () => {
  const DOC = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789";
  const PUB = "2PACX-1vQabcdefghijklmnopqrstuvwxyz_0123456789";

  it("covers a document in each of its views, and nothing else on docs.google.com", () => {
    for (const url of [
      `https://docs.google.com/document/d/${DOC}/edit`,
      `https://docs.google.com/document/d/${DOC}/edit?tab=t.0#heading=h.1`,
      `https://docs.google.com/document/d/${DOC}/preview`,
      `https://docs.google.com/document/d/${DOC}/mobilebasic`,
      `https://docs.google.com/document/u/1/d/${DOC}/edit`,
      `https://docs.google.com/document/d/e/${PUB}/pub`,
    ])
      expect(profileFor(url), url).not.toBeNull();
    for (const url of [
      "https://docs.google.com/",
      "https://docs.google.com/document/",
      `https://docs.google.com/spreadsheets/d/${DOC}/edit`,
      `https://docs.google.com/presentation/d/${DOC}/edit`,
      `https://docs.google.com.evil.com/document/d/${DOC}/edit`,
    ])
      expect(profileFor(url), url).toBeNull();
  });

  it("points the editor, and only the editor, to the mobile view of the same document and account", () => {
    const readable = (url: string) => profileFor(url)!.readableUrl?.();
    expect(readable(`https://docs.google.com/document/d/${DOC}/edit?tab=t.0#heading=h.1`)).toBe(
      `https://docs.google.com/document/d/${DOC}/mobilebasic`,
    );
    expect(readable(`https://docs.google.com/document/u/1/d/${DOC}/edit`)).toBe(
      `https://docs.google.com/document/u/1/d/${DOC}/mobilebasic`,
    );
    expect(readable(`https://docs.google.com/document/d/${DOC}/edit?authuser=1&tab=t.0&resourcekey=0-abc#heading=h.1`)).toBe(
      `https://docs.google.com/document/d/${DOC}/mobilebasic?authuser=1&resourcekey=0-abc`,
    );
    expect(profileFor(`https://docs.google.com/document/d/e/${PUB}/edit`)?.readableUrl).toBeUndefined();
    for (const view of ["preview", "mobilebasic"]) expect(readable(`https://docs.google.com/document/d/${DOC}/${view}`)).toBeUndefined();
    expect(readable(`https://docs.google.com/document/d/e/${PUB}/pub`)).toBeUndefined();
  });

  it("names a document by its id, whichever view or account is open", () => {
    for (const url of [
      `https://docs.google.com/document/d/${DOC}/edit?tab=t.0`,
      `https://docs.google.com/document/d/${DOC}/mobilebasic`,
      `https://docs.google.com/document/u/2/d/${DOC}/preview`,
    ])
      expect(idOf(url), url).toBe(`gdoc:${DOC}`);
  });

  it("names a published document by its publishing id, which is not the document's own", () => {
    expect(idOf(`https://docs.google.com/document/d/e/${PUB}/pub`)).toBe(`gdoc:e/${PUB}`);
  });

  it("reads the text of the published and mobile views", () => {
    const published = page("", `<div id="header">Sign in</div><div id="contents"><div class="doc-content"><p>Q4 plan</p></div></div>`);
    const root = profileFor(`https://docs.google.com/document/d/e/${PUB}/pub`)!.root(published);
    expect(root?.textContent).toBe("Q4 plan");
    const basic = page("", `<div class="doc-content"><p>Q4 plan</p></div>`);
    expect(profileFor(`https://docs.google.com/document/d/${DOC}/mobilebasic`)!.root(basic)?.textContent).toBe("Q4 plan");
  });

  it("reads nothing in the editor, whose text is drawn rather than written", () => {
    expect(profileFor(`https://docs.google.com/document/d/${DOC}/edit`)!.root(page("", `<canvas></canvas>`))?.textContent).toBe("");
  });

  it("calls only a published document public", () => {
    const hint = (url: string) => profileFor(url)!.privacy(new URL(url), page("", ""));
    expect(hint(`https://docs.google.com/document/d/e/${PUB}/pub`)).toBe("likely-public");
    expect(hint(`https://docs.google.com/document/d/${DOC}/mobilebasic`)).toBe("unknown");
    expect(hint(`https://docs.google.com/document/d/${DOC}/edit`)).toBe("unknown");
  });
});

describe("profiles keep an id and its text together", () => {
  const NID = "0123456789abcdef0123456789abcdef";
  const ROW = "abcdefabcdefabcdefabcdefabcdefab";
  const DOC = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789";
  const dashed = `${ROW.slice(0, 8)}-${ROW.slice(8, 12)}-${ROW.slice(12, 16)}-${ROW.slice(16, 20)}-${ROW.slice(20)}`;
  const behind = `<div class="notion-frame"><div class="notion-page-content">Tasks database</div></div>`;

  it("reads nothing, rather than the database behind it, while a peeked row has not rendered", () => {
    const profile = profileFor(`https://www.notion.so/Tasks-${NID}?p=${ROW}`)!;
    expect(profile.root(page("", behind))?.textContent).toBe("");
  });

  it("ignores a peek left in the page after the address went back to a full page", () => {
    const stale = `${behind}<div class="notion-peek-renderer"><div class="notion-page-content">Old row</div></div>`;
    expect(profileFor(`https://www.notion.so/Tasks-${NID}`)!.root(page("", stale))?.textContent).toBe("Tasks database");
  });

  it("names a peeked row given in the dashed form too", () => {
    expect(idOf(`https://www.notion.so/Tasks-${NID}?p=${dashed}`)).toBe(`notion:${ROW}`);
  });

  it("leaves the app's own pages alone, and pages more than a workspace deep", () => {
    for (const path of ["templates/Plan", "help/Plan", "product/Plan", "onboarding/Plan"])
      expect(profileFor(`https://www.notion.so/${path}-${NID}`), path).toBeNull();
    expect(profileFor(`https://www.notion.so/a/b/Plan-${NID}`)).toBeNull();
  });

  it("reads a Google document only in the views that show it, and not the editor's menus as its text", () => {
    for (const view of ["copy", "export", "revisions", "comment"])
      expect(profileFor(`https://docs.google.com/document/d/${DOC}/${view}`), view).toBeNull();
    const editor = page("", `<div class="docs-menubar">File Edit View</div>`);
    const root = profileFor(`https://docs.google.com/document/d/${DOC}/edit`)!.root(editor);
    expect(root).not.toBeNull();
    expect(root?.textContent).toBe("");
  });
});
