/** The wire format a model address speaks. Most services copy OpenAI's; Anthropic and Gemini also have native APIs. */
export type ApiType = "openai" | "anthropic" | "gemini";

export const API_TYPES: readonly ApiType[] = ["openai", "anthropic", "gemini"];

export const API_TYPE_LABELS: Record<ApiType, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic Messages",
  gemini: "Google Gemini",
};

export const isApiType = (v: unknown): v is ApiType => typeof v === "string" && (API_TYPES as readonly string[]).includes(v);

export interface Provider {
  id: string;
  label: string;
  apiType: ApiType;
  /** Pre-filled address; empty for "custom". */
  baseUrl: string;
  /** Example model name, shown as a hint. */
  modelHint: string;
  local?: boolean;
}

export const PROVIDERS: readonly Provider[] = [
  { id: "ollama", label: "Ollama", apiType: "openai", baseUrl: "http://127.0.0.1:11434/v1", modelHint: "qwen3", local: true },
  { id: "openai", label: "OpenAI", apiType: "openai", baseUrl: "https://api.openai.com/v1", modelHint: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", apiType: "anthropic", baseUrl: "https://api.anthropic.com/v1", modelHint: "claude-sonnet-5-5" },
  {
    id: "gemini",
    label: "Google Gemini",
    apiType: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelHint: "gemini-2.5-flash",
  },
  { id: "grok", label: "xAI Grok", apiType: "openai", baseUrl: "https://api.x.ai/v1", modelHint: "grok-4" },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiType: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    modelHint: "anthropic/claude-sonnet-5-5",
  },
  { id: "custom", label: "Custom", apiType: "openai", baseUrl: "", modelHint: "" },
];

export const providerById = (id: string): Provider | undefined => PROVIDERS.find((p) => p.id === id);

function parse(baseUrl: string): URL | null {
  try {
    return new URL(baseUrl.trim());
  } catch {
    return null;
  }
}

/**
 * The format an address speaks, from its host: the address decides it, not the model name, because the same model is served
 * through gateways (OpenRouter, LiteLLM, company proxies) that all use the OpenAI format. Google's OpenAI-compatible endpoint
 * lives under `/openai`, so it stays OpenAI-compatible.
 */
export function detectApiType(baseUrl: string): ApiType {
  const u = parse(baseUrl);
  if (!u) return "openai";
  const host = u.hostname.toLowerCase();
  if (host === "api.anthropic.com") return "anthropic";
  if (host === "generativelanguage.googleapis.com" && !/\/openai(\/|$)/i.test(u.pathname)) return "gemini";
  return "openai";
}

/** The preset that matches an address, or "custom". */
export function providerForAddress(baseUrl: string): Provider {
  const host = parse(baseUrl)?.host.toLowerCase();
  const found = PROVIDERS.find((p) => p.baseUrl && parse(p.baseUrl)?.host.toLowerCase() === host && detectApiType(baseUrl) === p.apiType);
  return found ?? PROVIDERS[PROVIDERS.length - 1]!;
}
