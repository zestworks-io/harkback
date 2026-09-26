import { normalizeBaseUrl } from "./model-client";
import { isLocalUrl, modelUrlError } from "./routing";

export type ConnectionResult =
  | { kind: "ok"; models: string[] }
  | { kind: "auth" }
  | { kind: "origin_blocked" }
  | { kind: "insecure" }
  | { kind: "http"; status: number }
  | { kind: "unreachable" };

export async function testConnection(
  cfg: { baseUrl: string; apiKey: string },
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<ConnectionResult> {
  if (modelUrlError(cfg.baseUrl)) return { kind: "insecure" };
  const headers: Record<string, string> = { accept: "application/json" };
  const key = cfg.apiKey.trim();
  if (key) headers.authorization = `Bearer ${key}`;
  let res: Response;
  try {
    res = await fetchImpl(`${normalizeBaseUrl(cfg.baseUrl)}/models`, { headers });
  } catch {
    return { kind: "unreachable" };
  }
  // Ollama answers 403 to origins that are not in OLLAMA_ORIGINS.
  if (res.status === 403 && isLocalUrl(cfg.baseUrl)) return { kind: "origin_blocked" };
  if (res.status === 401 || res.status === 403) return { kind: "auth" };
  if (!res.ok) return { kind: "http", status: res.status };
  try {
    const json = (await res.json()) as { data?: { id?: unknown }[] };
    const models = (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
    return { kind: "ok", models: models.sort() };
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
