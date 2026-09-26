import { modelUrlError, isLocalUrl } from "./routing";
import { normalizePattern } from "./site-rules";

export interface ModelConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface SiteRule {
  /** A domain ("example.com", covers subdomains) or a URL prefix ("https://example.com/docs"). */
  pattern: string;
  autoScan?: boolean;
  sensitive?: boolean;
  disabled?: boolean;
  modelId?: string;
}

export interface Settings {
  version: 1;
  onboarded: boolean;
  consentAt: string | null;
  language: "zh" | "en";
  models: ModelConfig[];
  defaultModelId: string | null;
  /** Model used for sensitive sources; must be a local address. */
  localModelId: string | null;
  sites: SiteRule[];
  rateLimit: { perMinute: number; perHour: number };
  reunion: { minGapDays: number; maxPerPage: number };
  backup: { enabled: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  onboarded: false,
  consentAt: null,
  language: "zh",
  models: [],
  defaultModelId: null,
  localModelId: null,
  sites: [],
  rateLimit: { perMinute: 10, perHour: 100 },
  reunion: { minGapDays: 3, maxPerPage: 3 },
  backup: { enabled: true },
};

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function withDefaults(raw: unknown): Settings {
  const s = obj(raw) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    version: 1,
    language: s.language === "en" ? "en" : "zh",
    models: Array.isArray(s.models) ? s.models : [],
    sites: Array.isArray(s.sites) ? s.sites : [],
    rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ...obj(s.rateLimit) },
    reunion: { ...DEFAULT_SETTINGS.reunion, ...obj(s.reunion) },
    backup: { ...DEFAULT_SETTINGS.backup, ...obj(s.backup) },
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
