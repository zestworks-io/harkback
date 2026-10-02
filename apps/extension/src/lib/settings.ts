import { isExplainLanguage, REUNION_DEFAULTS } from "@harkback/core";
import { isLocalUrl, modelUrlError } from "./model-policy";
import { isProviderId, providerById, providerForAddress, type ApiType } from "./providers";
import { normalizePattern } from "./site-rules";
import { isLang, type Lang } from "./ui/languages";

export interface ModelConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** The id of a provider in providers.ts; it also decides the wire format. */
  provider: string;
}

/** The wire format a model speaks, which its provider decides. */
export const apiTypeOf = (m: Pick<ModelConfig, "provider">): ApiType => providerById(m.provider).apiType;

export interface SiteRule {
  /** A domain ("example.com", covers subdomains) or a URL prefix ("https://example.com/docs"). A setting left out is inherited from a broader rule; `false` overrides one. */
  pattern: string;
  autoScan?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
  modelId?: string;
}

export type Theme = "system" | "light" | "dark";

export interface Settings {
  version: 1;
  onboarded: boolean;
  consentAt: string | null;
  /** Language of the interface, the library and exports. */
  language: Lang;
  /** Language explanations are written in: an `EXPLAIN_LANGUAGES` code, or "auto" to follow `language`. */
  explainLanguage: string;
  /** "system" follows the operating system. */
  theme: Theme;
  models: ModelConfig[];
  defaultModelId: string | null;
  /** Model used for sensitive sources; must be a local address. */
  localModelId: string | null;
  sites: SiteRule[];
  rateLimit: { perMinute: number; perHour: number };
  reunion: { minGapDays: number; maxPerPage: number };
  /** `excludeSensitive`: backups and exports leave out everything that came from sensitive sources. */
  backup: { enabled: boolean; excludeSensitive: boolean };
}

/** The language to write explanations in. */
export const explainLanguageOf = (s: Pick<Settings, "language" | "explainLanguage">): string =>
  s.explainLanguage === "auto" ? s.language : s.explainLanguage;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  onboarded: false,
  consentAt: null,
  language: "en",
  explainLanguage: "auto",
  theme: "system",
  models: [],
  defaultModelId: null,
  localModelId: null,
  sites: [],
  rateLimit: { perMinute: 10, perHour: 100 },
  reunion: { ...REUNION_DEFAULTS },
  backup: { enabled: true, excludeSensitive: false },
};

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function cleanModel(raw: unknown): ModelConfig[] {
  const m = obj(raw);
  if (typeof m.id !== "string" || !m.id) return [];
  const baseUrl = str(m.baseUrl);
  return [
    {
      id: m.id,
      label: str(m.label),
      baseUrl,
      apiKey: str(m.apiKey),
      model: str(m.model),
      // Models saved before providers existed get one worked out from their address.
      provider: isProviderId(m.provider) ? m.provider : providerForAddress(baseUrl).id,
    },
  ];
}

function cleanSite(raw: unknown): SiteRule[] {
  const r = obj(raw);
  if (typeof r.pattern !== "string") return [];
  return [
    {
      pattern: r.pattern,
      ...(typeof r.autoScan === "boolean" && { autoScan: r.autoScan }),
      ...(typeof r.sensitive === "boolean" && { sensitive: r.sensitive }),
      ...(typeof r.disabled === "boolean" && { disabled: r.disabled }),
      ...(typeof r.modelId === "string" && r.modelId && { modelId: r.modelId }),
    },
  ];
}

/** Turns whatever is in storage into valid settings: unknown or malformed fields fall back to their defaults. */
export function withDefaults(raw: unknown): Settings {
  const s = obj(raw);
  const d = DEFAULT_SETTINGS;
  const rate = obj(s.rateLimit);
  const reunion = obj(s.reunion);
  return {
    version: 1,
    onboarded: s.onboarded === true,
    consentAt: strOrNull(s.consentAt),
    language: isLang(s.language) ? s.language : "en",
    explainLanguage: isExplainLanguage(s.explainLanguage) ? s.explainLanguage : "auto",
    theme: s.theme === "light" || s.theme === "dark" ? s.theme : "system",
    models: Array.isArray(s.models) ? s.models.flatMap(cleanModel) : [],
    defaultModelId: strOrNull(s.defaultModelId),
    localModelId: strOrNull(s.localModelId),
    sites: Array.isArray(s.sites) ? s.sites.flatMap(cleanSite) : [],
    rateLimit: { perMinute: num(rate.perMinute, d.rateLimit.perMinute), perHour: num(rate.perHour, d.rateLimit.perHour) },
    reunion: { minGapDays: num(reunion.minGapDays, d.reunion.minGapDays), maxPerPage: num(reunion.maxPerPage, d.reunion.maxPerPage) },
    backup: {
      enabled: obj(s.backup).enabled === false ? false : d.backup.enabled,
      excludeSensitive: obj(s.backup).excludeSensitive === true,
    },
  };
}

const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Returns the paths of invalid fields; empty when the settings can be saved. */
export function validateSettings(s: Settings): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  s.models.forEach((m, i) => {
    if (!m.id || ids.has(m.id)) errors.push(`models[${i}].id`);
    ids.add(m.id);
    if (!m.label.trim()) errors.push(`models[${i}].label`);
    if (modelUrlError(m.baseUrl)) errors.push(`models[${i}].baseUrl`);
    if (!m.model.trim()) errors.push(`models[${i}].model`);
  });
  if (s.defaultModelId !== null && !ids.has(s.defaultModelId)) errors.push("defaultModelId");
  if (s.localModelId !== null) {
    const localModel = s.models.find((m) => m.id === s.localModelId);
    if (!localModel || !isLocalUrl(localModel.baseUrl)) errors.push("localModelId");
  }
  if (!isInt(s.rateLimit.perMinute, 1, 1000)) errors.push("rateLimit.perMinute");
  if (!isInt(s.rateLimit.perHour, 1, 10000)) errors.push("rateLimit.perHour");
  if (!isInt(s.reunion.minGapDays, 0, 365)) errors.push("reunion.minGapDays");
  if (!isInt(s.reunion.maxPerPage, 1, 10)) errors.push("reunion.maxPerPage");
  s.sites.forEach((r, i) => {
    if (!normalizePattern(r.pattern)) errors.push(`sites[${i}].pattern`);
    if (r.modelId !== undefined && !ids.has(r.modelId)) errors.push(`sites[${i}].modelId`);
  });
  return errors;
}
