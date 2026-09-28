import { CARD_LIMITS, DOMAINS, type Domain, type EncounterFlag } from "@harkback/spec";

export interface ParsedCard {
  matchConceptId: string | null;
  canonical: string;
  aliases: string[];
  domain: Domain;
  broader: string[];
  variants: string[];
  prerequisites: string[];
  confidence: { broader: number; variants: number; prerequisites: number };
}

export interface ParsedOutput {
  explanation: string;
  evidence: string | null;
  card: ParsedCard | null;
  flags: EncounterFlag[];
}

function block(raw: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(raw);
  return m ? m[1]!.trim() : null;
}

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > CARD_LIMITS.maxNameLength || /[<>\n\r]/.test(s) || !/[\p{L}\p{N}]/u.test(s)) return null;
  return s;
}

function names(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(cleanName)
    .filter((x): x is string => x !== null)
    .slice(0, max);
}

function confidence(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.5;
  return Math.min(Math.max(v, 0), CARD_LIMITS.maxLlmConfidence);
}

function parseCard(text: string | null, labels: ReadonlyMap<string, string>): ParsedCard | null {
  if (!text) return null;
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let obj: unknown;
  try {
    obj = JSON.parse(unfenced);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const canonical = cleanName(o.canonical);
  if (!canonical) return null;
  const domain = typeof o.domain === "string" && (DOMAINS as readonly string[]).includes(o.domain) ? (o.domain as Domain) : "other";
  const conf = typeof o.confidence === "object" && o.confidence !== null ? (o.confidence as Record<string, unknown>) : {};
  return {
    matchConceptId: typeof o.match === "string" ? (labels.get(o.match) ?? null) : null,
    canonical,
    aliases: names(o.aliases, CARD_LIMITS.maxAliases),
    domain,
    broader: names(o.broader, CARD_LIMITS.maxBroader),
    variants: names(o.variants, CARD_LIMITS.maxVariants),
    prerequisites: names(o.prerequisites, CARD_LIMITS.maxPrerequisites),
    confidence: { broader: confidence(conf.broader), variants: confidence(conf.variants), prerequisites: confidence(conf.prerequisites) },
  };
}

export function parseModelOutput(raw: string, labels: ReadonlyMap<string, string>): ParsedOutput {
  const explanation = block(raw, "explanation");
  if (explanation === null) {
    const text = raw
      .replace(/<(evidence|card)>[\s\S]*?<\/\1>/gi, "")
      .trim()
      .slice(0, CARD_LIMITS.maxExplanationLength);
    return { explanation: text, evidence: null, card: null, flags: ["card_missing"] };
  }
  const ev = block(raw, "evidence");
  const evidence = !ev || /^none$/i.test(ev) || ev.length > CARD_LIMITS.maxEvidenceLength ? null : ev;
  const card = parseCard(block(raw, "card"), labels);
  return {
    explanation: explanation.slice(0, CARD_LIMITS.maxExplanationLength),
    evidence,
    card,
    flags: card ? [] : ["card_missing"],
  };
}

export function streamingExplanation(partial: string): string {
  const start = partial.search(/<explanation>/i);
  if (start < 0) return /^\s*</.test(partial) ? "" : partial;
  const body = partial.slice(start + "<explanation>".length);
  const end = body.search(/<\/explanation>/i);
  if (end >= 0) return body.slice(0, end).trim();
  return body.replace(/<\/?[a-z]*$/i, "").trim();
}
