/** What a page suggests about whether its content is private. A hint only: the page reads the same to the extension either way. */
export type Privacy = "likely-public" | "likely-private" | "unknown";

/** What the extension knows about one site beyond what any web page offers. */
export interface SiteProfile {
  /** One id for one document, whatever address or tab of it is open. */
  sourceId(): string;
  /** Where the document's text is; null when the page no longer looks as expected, so the generic search takes over. */
  root(doc: Document): Element | null;
  privacy(url: URL, doc: Document): Privacy;
  /** False for a page that has a document but no text to read, such as an editor that draws on a canvas. */
  readonly readable?: false;
  /** Where the same document can be read, for a page that cannot be; set only together with `readable: false`. */
  readableUrl?(): string;
}

interface Profile {
  /** The profile for this address, or null when the profile does not cover it. */
  match(url: URL): SiteProfile | null;
}

// First path segments of github.com that are features of the site, not owners.
const GITHUB_RESERVED = new Set([
  "about",
  "account",
  "apps",
  "codespaces",
  "collections",
  "contact",
  "copilot",
  "customer-stories",
  "dashboard",
  "education",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "new",
  "nonprofit",
  "notifications",
  "organizations",
  "orgs",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "site",
  "solutions",
  "sponsors",
  "stars",
  "team",
  "topics",
  "trending",
  "users",
  "watching",
]);
const GITHUB_OWNER = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
const GITHUB_REPO = /^[\w.-]+$/;
// The README of a repository's home page; the conversation of an issue or pull request, in the older and the newer layout.
const GITHUB_REPO_ROOT = ["article.markdown-body"];
const GITHUB_CONVERSATION_ROOT = [".js-discussion", '[data-testid="issue-viewer-container"]'];

function firstMatch(doc: Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    // An element with no text is a placeholder, not the document.
    if (el?.textContent?.trim()) return el;
  }
  return null;
}

const github: Profile = {
  match(url) {
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const [owner, rawRepo, kind, number] = url.pathname.split("/").filter(Boolean);
    // github.com/o/r.git is the clone address of github.com/o/r.
    const repo = rawRepo?.replace(/\.git$/i, "");
    if (!owner || !repo || GITHUB_RESERVED.has(owner.toLowerCase()) || !GITHUB_OWNER.test(owner) || !GITHUB_REPO.test(repo)) return null;
    const conversation = (kind === "issues" || kind === "pull") && number !== undefined && /^\d+$/.test(number);
    if (kind !== undefined && !conversation) return null;
    const id = `github:${owner}/${repo}`.toLowerCase();
    return {
      sourceId: () => (conversation ? `${id}#${Number(number)}` : id),
      root: (doc) => firstMatch(doc, conversation ? GITHUB_CONVERSATION_ROOT : GITHUB_REPO_ROOT),
      privacy(_url, doc) {
        const flag = doc.querySelector('meta[name="octolytics-dimension-repository_public"]')?.getAttribute("content");
        if (flag === "false") return "likely-private";
        if (flag === "true") return "likely-public";
        for (const label of doc.querySelectorAll("#repository-container-header .Label")) {
          const text = label.textContent?.trim().toLowerCase();
          if (text && /^private\b/.test(text)) return "likely-private";
          if (text && /^public\b/.test(text)) return "likely-public";
        }
        return "unknown";
      },
    };
  },
};

/** A root with no text, for a page that has a document but nothing to read yet: the generic search would read the page around it instead. */
const nothingToRead = (doc: Document): Element => doc.createElement("div");

/** The first element with text that is not inside `excluded`. */
function firstOutside(doc: Document, selector: string, excluded: string): Element | null {
  for (const el of doc.querySelectorAll(selector)) if (!el.closest(excluded) && el.textContent?.trim()) return el;
  return null;
}

// A Notion page's address ends in its id, 32 hex digits or the dashed form, after the title when there is one.
const NOTION_ID = "[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NOTION_PAGE_ID = new RegExp(`(?:^|-)(${NOTION_ID})$`, "i");
const NOTION_PEEK_ID = new RegExp(`^(?:${NOTION_ID})$`, "i");
const NOTION_CONTENT = ".notion-page-content";
// A page opened in a peek sits over the page behind it, which stays in the document.
const NOTION_PEEK = ".notion-peek-renderer";
// First path segments of notion.so that are parts of the app, not workspaces.
const NOTION_APP_PATHS = new Set([
  "api",
  "help",
  "invite",
  "login",
  "my-integrations",
  "onboarding",
  "product",
  "settings",
  "signup",
  "templates",
]);

const notion: Profile = {
  match(url) {
    const published = url.hostname.endsWith(".notion.site");
    if (!published && url.hostname !== "notion.so" && url.hostname !== "www.notion.so") return null;
    // A page is `/<title>-<id>`, `/<id>`, or either of those inside a workspace.
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 2 || NOTION_APP_PATHS.has(segments[0]?.toLowerCase() ?? "")) return null;
    // Opening a row of a database in a peek leaves the database in the path and puts the row's id in `p`.
    const param = url.searchParams.get("p") ?? "";
    const peeked = NOTION_PEEK_ID.test(param) ? param : undefined;
    const raw = peeked ?? NOTION_PAGE_ID.exec(segments.at(-1) ?? "")?.[1];
    if (!raw) return null;
    const id = raw.replace(/-/g, "").toLowerCase();
    return {
      sourceId: () => `notion:${id}`,
      // While the peek has not rendered, the only text in the document is the database's, which is not the row.
      root: (doc) =>
        peeked
          ? (firstOutside(doc, `${NOTION_PEEK} ${NOTION_CONTENT}`, "never-matches") ?? nothingToRead(doc))
          : firstOutside(doc, NOTION_CONTENT, NOTION_PEEK),
      // A page in a workspace may be private or shared; only a published one says it is public.
      privacy: () => (published ? "likely-public" : "unknown"),
    };
  },
};

// /document/d/<id>/<view>, /document/u/<n>/d/<id>/<view> for the account in use, and /document/d/e/<publishing id>/pub for a published copy.
const GDOC_PATH = /^\/document\/(?:u\/\d+\/)?d\/(e\/)?([\w-]+)(?:\/(edit|preview|view|mobilebasic|pub))?\/?$/;
// The published and mobile views are written as HTML.
const GDOC_ROOT = [".doc-content", "#contents"];

const googleDocs: Profile = {
  match(url) {
    if (url.hostname !== "docs.google.com") return null;
    const m = GDOC_PATH.exec(url.pathname);
    if (!m) return null;
    const published = m[1] !== undefined;
    return {
      sourceId: () => `gdoc:${published ? "e/" : ""}${m[2]}`,
      // The editor draws its text on a canvas, so the page around it is menus and toolbars, not the document.
      root: (doc) => (m[3] === "edit" ? nothingToRead(doc) : firstMatch(doc, GDOC_ROOT)),
      ...(m[3] === "edit"
        ? {
            readable: false as const,
            // The mobile view of the same document, in the same account; the tab and heading of the editor address are dropped.
            readableUrl: () => `https://docs.google.com${url.pathname.replace(/\/edit\/?$/, "/mobilebasic")}`,
          }
        : {}),
      // Publishing a document to the web is a deliberate act; opening one by its address says nothing either way.
      privacy: () => (published ? "likely-public" : "unknown"),
    };
  },
};

const PROFILES: readonly Profile[] = [github, notion, googleDocs];

/** The profile for a page address; null for pages that are read the generic way. */
export function profileFor(url: string): SiteProfile | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  for (const p of PROFILES) {
    const matched = p.match(u);
    if (matched) return matched;
  }
  return null;
}
