/** What a page suggests about whether its content is private. A hint only: the page reads the same to the extension either way. */
export type Privacy = "likely-public" | "likely-private" | "unknown";

/** What the extension knows about one site beyond what any web page offers. */
export interface SiteProfile {
  /** One id for one document, whatever address or tab of it is open. */
  sourceId(): string;
  /** Where the document's text is; null when the page no longer looks as expected, so the generic search takes over. */
  root(doc: Document): Element | null;
  privacy(url: URL, doc: Document): Privacy;
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

const PROFILES: readonly Profile[] = [github];

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
