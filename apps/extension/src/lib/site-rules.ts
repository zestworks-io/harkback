import type { SiteRule } from "./settings";

export interface EffectiveRule {
  autoScan: boolean;
  sensitive: boolean;
  disabled: boolean;
  modelId: string | null;
}

const NO_RULE: EffectiveRule = { autoScan: false, sensitive: false, disabled: false, modelId: null };

const isPrefix = (p: string) => /^https?:\/\//i.test(p);

/** A domain in lower case (no scheme, no leading "*.") or an absolute http(s) URL prefix; null when invalid. */
export function normalizePattern(raw: string): string | null {
  const p = raw.trim();
  if (!p) return null;
  if (isPrefix(p)) {
    try {
      return new URL(p).href;
    } catch {
      return null;
    }
  }
  const domain = p.toLowerCase().replace(/^\*\./, "").replace(/\/+$/, "");
  return /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$/.test(domain) ? domain : null;
}

function ruleMatches(pattern: string, url: URL): boolean {
  const p = normalizePattern(pattern);
  if (!p) return false;
  if (isPrefix(p))
    return url.href.startsWith(p) && (p.endsWith("/") || p.length === url.href.length || "/?#".includes(url.href[p.length]!));
  return url.hostname === p || url.hostname.endsWith(`.${p}`);
}

/** A URL prefix is more specific than a domain; between two of a kind, the longer one is. */
function specificity(pattern: string): number {
  const p = normalizePattern(pattern) ?? "";
  return (isPrefix(p) ? 1_000_000 : 0) + p.length;
}

/** For each setting the most specific matching rule that states it wins, so a rule for one path can override its whole site, on or off. */
export function effectiveRule(rules: readonly SiteRule[], url: string): EffectiveRule {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ...NO_RULE };
  }
  const matching = rules.filter((r) => ruleMatches(r.pattern, u)).sort((a, b) => specificity(b.pattern) - specificity(a.pattern));
  const flag = (key: "autoScan" | "sensitive" | "disabled"): boolean => matching.find((r) => typeof r[key] === "boolean")?.[key] === true;
  return {
    autoScan: flag("autoScan"),
    sensitive: flag("sensitive"),
    disabled: flag("disabled"),
    modelId: matching.find((r) => r.modelId)?.modelId ?? null,
  };
}

/** Whether the reader's site rules call a recorded source sensitive, whatever it was recorded as. */
export function sensitiveBySiteRule(rules: readonly SiteRule[], source: { ids: { url?: string } }): boolean {
  return source.ids.url !== undefined && effectiveRule(rules, source.ids.url).sensitive;
}

/** Match patterns for chrome.permissions / registerContentScripts. Match patterns cannot carry ports. */
export function hostPermissionPatterns(pattern: string): string[] {
  const p = normalizePattern(pattern);
  if (!p) return [];
  if (isPrefix(p)) {
    const u = new URL(p);
    return [`${u.protocol}//${u.hostname}/*`];
  }
  return [`*://${p}/*`, `*://*.${p}/*`];
}

export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? `${u.protocol}//${u.hostname}/*` : null;
  } catch {
    return null;
  }
}
