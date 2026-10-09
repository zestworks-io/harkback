import { isExplainLanguage, REUNION_DEFAULTS } from "@harkback/core";
import { isLocalUrl, modelUrlError } from "../models/model-policy";
import { isProviderId, providerById, providerForAddress, type ApiType } from "../models/providers";
import { normalizePattern } from "../source/site-rules";
import { isLang, type Lang } from "../ui/languages";

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
  /** How long a model may stay quiet before a request is given up: once the answer has started, and before its first text. */
  timeouts: { idleSeconds: number; firstTextSeconds: number };
  /**
   * `desiredRetention`: the share of reviewed terms you want to still remember when they come due; higher means more reviews.
   * `modelCheck`: review offers "Check my answer", which sends your answer and the stored explanation to your model.
   */
  review: { desiredRetention: number; modelCheck: boolean };
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
  timeouts: { idleSeconds: 30, firstTextSeconds: 120 },
  review: { desiredRetention: 0.9, modelCheck: true },
  backup: { enabled: true, excludeSensitive: false },
};

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
/** A whole number of at least `min`; anything else (a hand-edited zero, a fraction) would lock requests out or never fire. */
const count = (v: unknown, fallback: number, min: number): number =>
  Number.isInteger(v) && (v as number) >= min ? (v as number) : fallback;

export const MIN_RETENTION = 0.7;
export const MAX_RETENTION = 0.97;

/** A number between `min` and `max`; anything else falls back. */
const within = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;

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
  const timeouts = obj(s.timeouts);
  const review = obj(s.review);
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
    rateLimit: { perMinute: count(rate.perMinute, d.rateLimit.perMinute, 1), perHour: count(rate.perHour, d.rateLimit.perHour, 1) },
    reunion: {
      minGapDays: count(reunion.minGapDays, d.reunion.minGapDays, 0),
      maxPerPage: count(reunion.maxPerPage, d.reunion.maxPerPage, 1),
    },
    timeouts: {
      idleSeconds: within(timeouts.idleSeconds, d.timeouts.idleSeconds, 5, 600),
      firstTextSeconds: within(timeouts.firstTextSeconds, d.timeouts.firstTextSeconds, 10, 1800),
    },
    review: {
      desiredRetention: within(review.desiredRetention, d.review.desiredRetention, MIN_RETENTION, MAX_RETENTION),
      modelCheck: review.modelCheck !== false,
    },
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
  if (!isInt(s.timeouts.idleSeconds, 5, 600)) errors.push("timeouts.idleSeconds");
  if (!isInt(s.timeouts.firstTextSeconds, 10, 1800)) errors.push("timeouts.firstTextSeconds");
  if (!(s.review.desiredRetention >= MIN_RETENTION && s.review.desiredRetention <= MAX_RETENTION)) errors.push("review.desiredRetention");
  s.sites.forEach((r, i) => {
    if (!normalizePattern(r.pattern)) errors.push(`sites[${i}].pattern`);
    if (r.modelId !== undefined && !ids.has(r.modelId)) errors.push(`sites[${i}].modelId`);
  });
  return errors;
}
