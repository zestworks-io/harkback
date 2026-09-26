import type { ModelConfig, Settings } from "./settings";
import type { EffectiveRule } from "./site-rules";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function modelUrlError(url: string): "invalid" | "insecure" | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "invalid";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "invalid";
  if (u.protocol === "http:" && !isLocalUrl(u.href)) return "insecure";
  return null;
}

export type Route =
  | { kind: "ok"; model: ModelConfig; remote: boolean }
  | { kind: "error"; code: "no_model" | "needs_local_model" | "insecure_model" };

export function chooseModel(settings: Settings, rule: EffectiveRule, sensitive: boolean): Route {
  const id = rule.modelId ?? (sensitive ? settings.localModelId : settings.defaultModelId);
  const model = id ? settings.models.find((m) => m.id === id) : undefined;
  if (!model) return { kind: "error", code: sensitive ? "needs_local_model" : "no_model" };
  if (modelUrlError(model.baseUrl)) return { kind: "error", code: "insecure_model" };
  const remote = !isLocalUrl(model.baseUrl);
  if (sensitive && remote) return { kind: "error", code: "needs_local_model" };
  return { kind: "ok", model, remote };
}
