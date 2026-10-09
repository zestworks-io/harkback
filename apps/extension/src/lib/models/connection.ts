import { defaultFetch, normalizeBaseUrl, requestHeaders } from "./model-client";
import { builtInState, isBuiltInUrl } from "./builtin-ai";
import { isLocalUrl, modelUrlError } from "./model-policy";
import type { ApiType } from "./providers";
import { apiTypeOf, type ModelConfig } from "../storage/settings";

export type ConnectionResult =
  | { kind: "ok"; models: string[] }
  | { kind: "auth" }
  | { kind: "origin_blocked" }
  | { kind: "insecure" }
  | { kind: "http"; status: number }
  | { kind: "unreachable" };

/** Lists the models of an address: the request and where to find the names depend on the provider. */
function listRequest(cfg: Pick<ModelConfig, "baseUrl" | "apiKey" | "provider">): { url: string; headers: Record<string, string> } {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const key = cfg.apiKey.trim();
  switch (apiTypeOf(cfg)) {
    case "anthropic":
      return {
        url: `${base}/models?limit=1000`,
        headers: {
          accept: "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          ...(key && { "x-api-key": key }),
        },
      };
    case "gemini":
      return { url: `${base}/models?pageSize=1000`, headers: { accept: "application/json", ...(key && { "x-goog-api-key": key }) } };
    default:
      return { url: `${base}/models`, headers: requestHeaders(cfg.apiKey, { accept: "application/json" }) };
  }
}

function modelNames(type: ApiType, json: unknown): string[] {
  if (type === "gemini") {
    const list = (json as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] } | null)?.models ?? [];
    return list
      .filter((m) => !Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => (typeof m.name === "string" ? m.name.replace(/^models\//, "") : ""))
      .filter(Boolean);
  }
  const list = (json as { data?: { id?: unknown }[] } | null)?.data ?? [];
  return list.map((m) => m.id).filter((id): id is string => typeof id === "string");
}

export async function testConnection(
  cfg: Pick<ModelConfig, "baseUrl" | "apiKey" | "provider">,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<ConnectionResult> {
  // Nothing to reach: the question is whether the browser has the model ready.
  if (isBuiltInUrl(cfg.baseUrl)) return (await builtInState()) === "available" ? { kind: "ok", models: [] } : { kind: "unreachable" };
  if (modelUrlError(cfg.baseUrl)) return { kind: "insecure" };
  const type = apiTypeOf(cfg);
  const { url, headers } = listRequest(cfg);
  let res: Response;
  try {
    res = await fetchImpl(url, { headers });
  } catch {
    return { kind: "unreachable" };
  }
  // Ollama answers 403 to origins that are not in OLLAMA_ORIGINS.
  if (res.status === 403 && isLocalUrl(cfg.baseUrl)) return { kind: "origin_blocked" };
  // Gemini answers a wrong key with 400.
  if (res.status === 401 || res.status === 403 || (type === "gemini" && res.status === 400)) return { kind: "auth" };
  if (!res.ok) return { kind: "http", status: res.status };
  try {
    return { kind: "ok", models: modelNames(type, await res.json()).sort() };
  } catch {
    return { kind: "ok", models: [] };
  }
}

export function ollamaOriginsHelp(origin: string): { mac: string; linux: string; windows: string } {
  return {
    mac: `launchctl setenv OLLAMA_ORIGINS "${origin}"`,
    linux: `sudo systemctl edit ollama.service  # [Service] Environment="OLLAMA_ORIGINS=${origin}"`,
    windows: `setx OLLAMA_ORIGINS "${origin}"`,
  };
}
