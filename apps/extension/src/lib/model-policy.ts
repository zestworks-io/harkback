import type { ModelConfig, Settings } from "./settings";
import type { EffectiveRule } from "./site-rules";

const LOCAL_HOSTS = new Set(["localhost", "[::1]", "::1"]);

/** This machine: `localhost` and its subdomains, the whole 127.0.0.0/8 loopback range, and `::1`. */
export function isLocalUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  const v4 = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return v4 !== null && [v4[1], v4[2], v4[3]].every((n) => Number(n) <= 255);
}

/**
 * A server on the home or office network, or a Tailscale address: reachable only from inside, so plain http to it is not
 * exposed to the open internet. It still counts as remote, because the machine behind it is not this one.
 */
export function isPrivateNetworkUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".ts.net")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10) addresses.
  return /^\[(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(host);
}

export function modelUrlError(url: string): "invalid" | "insecure" | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "invalid";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "invalid";
  if (u.protocol === "http:" && !isLocalUrl(u.href) && !isPrivateNetworkUrl(u.href)) return "insecure";
  return null;
}

export type Route =
  { kind: "ok"; model: ModelConfig; remote: boolean } | { kind: "error"; code: "no_model" | "needs_local_model" | "insecure_model" };

/** `picked` is a model the reader chose for this one request; it still has to pass the sensitivity check below. */
export function chooseModel(settings: Settings, rule: EffectiveRule, sensitive: boolean, picked?: string): Route {
  const id = picked ?? rule.modelId ?? (sensitive ? settings.localModelId : settings.defaultModelId);
  const model = id ? settings.models.find((m) => m.id === id) : undefined;
  if (!model) return { kind: "error", code: sensitive ? "needs_local_model" : "no_model" };
  if (modelUrlError(model.baseUrl)) return { kind: "error", code: "insecure_model" };
  const remote = !isLocalUrl(model.baseUrl);
  if (sensitive && remote) return { kind: "error", code: "needs_local_model" };
  return { kind: "ok", model, remote };
}
