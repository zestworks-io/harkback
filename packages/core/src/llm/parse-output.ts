import { CARD_LIMITS, DOMAINS, type Domain, type EncounterFlag } from "@harkback/spec";
import { identityKey } from "../concepts/normalize";
import { nameFitsLanguage } from "./languages";

export interface ParsedCard {
  matchConceptId: string | null;
  canonical: string;
  aliases: string[];
  /** The term's name in the explain language, to be confirmed by the user before it matches anything. */
  translations: string[];
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

/** The text of `<tag>…</tag>`; a block cut off by the token limit runs to the next tag or the end. */
function block(raw: string, tag: string): string | null {
  const closed = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(raw);
  if (closed) return closed[1]!.trim();
  const open = new RegExp(`<${tag}>([\\s\\S]*?)(?=<(?:explanation|evidence|card)>|$)`, "i").exec(raw);
  return open ? open[1]!.trim() : null;
}

/** The outermost `{…}` of a card, so prose or code fences around it do not matter. */
function jsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const body = text.slice(start, end + 1);
  for (const candidate of [body, body.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next repair.
    }
  }
  return null;
}

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > CARD_LIMITS.maxNameLength || /[<>\n\r]/.test(s) || !/[\p{L}\p{N}]/u.test(s)) return null;
  return s;
}

function names(v: unknown, max: number): string[] {
  const list = typeof v === "string" ? [v] : v;
  if (!Array.isArray(list)) return [];
  return list
    .map(cleanName)
    .filter((x): x is string => x !== null)
    .slice(0, max);
}

function confidence(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.5;
  return Math.min(Math.max(v, 0), CARD_LIMITS.maxLlmConfidence);
}

function parseCard(text: string | null, labels: ReadonlyMap<string, string>, language: string): ParsedCard | null {
  if (!text) return null;
  const obj = jsonObject(text);
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const canonical = cleanName(o.canonical);
  if (!canonical) return null;
  const domain = typeof o.domain === "string" && (DOMAINS as readonly string[]).includes(o.domain) ? (o.domain as Domain) : "other";
  const conf = typeof o.confidence === "object" && o.confidence !== null ? (o.confidence as Record<string, unknown>) : {};
  const aliases = names(o.aliases, CARD_LIMITS.maxAliases);
  const taken = new Set([canonical, ...aliases].map(identityKey));
  const translations = names(o.translations, CARD_LIMITS.maxTranslations).filter(
    (n) => nameFitsLanguage(n, language) && !taken.has(identityKey(n)),
  );
  return {
    matchConceptId: typeof o.match === "string" ? (labels.get(/c\d+/i.exec(o.match)?.[0]?.toLowerCase() ?? o.match) ?? null) : null,
    canonical,
    aliases,
    translations,
    domain,
    broader: names(o.broader, CARD_LIMITS.maxBroader),
    variants: names(o.variants, CARD_LIMITS.maxVariants),
    prerequisites: names(o.prerequisites, CARD_LIMITS.maxPrerequisites),
    confidence: { broader: confidence(conf.broader), variants: confidence(conf.variants), prerequisites: confidence(conf.prerequisites) },
  };
}

/** A card's JSON written without its tag: an object that opens with one of the card's keys. */
const CARD_START = /\{\s*"(?:match|canonical|aliases)"\s*:/;
/** A code fence holding JSON, which a reply without tags may put its card in. */
const JSON_FENCE = /```[ \t]*(?:json)?[ \t]*\n?(\{[\s\S]*?)(?:```|$)/gi;

/** The end of the `{…}` starting at `start`, with strings skipped; the text's end when it is not closed. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}

/**
 * A reply that left out the explanation tag, which small models do: the prose is the explanation, and a card written
 * without its tag (in a JSON code fence, or bare) is taken out of it and read as the card.
 */
function untaggedReply(raw: string): { explanation: string; card: string | null } {
  let card = block(raw, "card");
  let text = raw.replace(/<(evidence|card)>[\s\S]*?(?:<\/\1>|$)/gi, "");
  text = text.replace(JSON_FENCE, (whole, body: string) => {
    if (!CARD_START.test(body)) return whole;
    card ??= body;
    return "";
  });
  for (let m = CARD_START.exec(text); m; m = CARD_START.exec(text)) {
    const end = objectEnd(text, m.index);
    card ??= text.slice(m.index, end);
    text = text.slice(0, m.index) + text.slice(end);
  }
  return { explanation: text.replace(/<\/?(?:explanation|evidence|card)>/gi, "").trim(), card };
}

/** `language` is the explain language; a card's translations are kept only when they are written in it. */
export function parseModelOutput(raw: string, labels: ReadonlyMap<string, string>, language = "en"): ParsedOutput {
  const explanation = block(raw, "explanation");
  if (explanation === null) {
    const loose = untaggedReply(raw);
    const card = parseCard(loose.card, labels, language);
    return {
      explanation: loose.explanation.slice(0, CARD_LIMITS.maxExplanationLength),
      evidence: null,
      card,
      flags: card ? [] : ["card_missing"],
    };
  }
  const ev = block(raw, "evidence");
  const evidence = !ev || /^none$/i.test(ev) || ev.length > CARD_LIMITS.maxEvidenceLength ? null : ev;
  const card = parseCard(block(raw, "card"), labels, language);
  return {
    explanation: explanation.slice(0, CARD_LIMITS.maxExplanationLength),
    evidence,
    card,
    flags: card ? [] : ["card_missing"],
  };
}

export function streamingExplanation(partial: string): string {
  const start = partial.search(/<explanation>/i);
  if (start < 0) {
    // No tag: the prose so far, up to a tag or a card in JSON, without a tag or fence still being written.
    const cut = partial.search(/<\/?(?:explanation|evidence|card)>|```\s*(?:json)?\s*(?:\{|$)|\{\s*"/i);
    return (cut >= 0 ? partial.slice(0, cut) : partial).replace(/(?:<\/?[a-z]*|`{1,3}[a-z]*)$/i, "").trim();
  }
  const body = partial.slice(start + "<explanation>".length);
  const end = body.search(/<\/explanation>/i);
  if (end >= 0) return body.slice(0, end).trim();
  return body.replace(/<\/?[a-z]*$/i, "").trim();
}
