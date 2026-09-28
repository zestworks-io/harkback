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
  if (isPrefix(p)) return url.href.startsWith(p);
  return url.hostname === p || url.hostname.endsWith(`.${p}`);
}

export function effectiveRule(rules: readonly SiteRule[], url: string): EffectiveRule {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ...NO_RULE };
  }
  const matching = rules.filter((r) => ruleMatches(r.pattern, u)).sort((a, b) => b.pattern.length - a.pattern.length);
  if (matching.length === 0) return { ...NO_RULE };
  return {
    autoScan: matching.some((r) => r.autoScan === true),
    sensitive: matching.some((r) => r.sensitive === true),
    disabled: matching.some((r) => r.disabled === true),
    modelId: matching.find((r) => r.modelId)?.modelId ?? null,
  };
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
