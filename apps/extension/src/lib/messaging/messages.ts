import type { Grade, Hit, MatcherEntry, ReviewAction, Verdict } from "@harkback/core";
import type { HarkEvent, Tier } from "@harkback/spec";
import type { ExplainRequestMsg, PlanError } from "../explain/explain";
import type { ModelErrorCode } from "../models/model-client";
import type { PreviewTerm } from "../explain/preview";
import type { ReunionCard } from "../records/reunion-cards";
import type { Theme } from "../storage/settings";
import type { Choice } from "../source/privacy-gate";
import type { Privacy } from "../source/site-profiles";
import type { DetectedSource } from "../source/source-id";
import type { Lang, StringKey } from "../ui/strings";

export type ErrorCode = PlanError | ModelErrorCode | "local_rate" | "no_permission" | "expired" | "internal";

/** Content script → background, on the "explain" port. */
export type PortIn =
  | { type: "start"; request: ExplainRequestMsg }
  | { type: "answer"; sameConcept: boolean }
  | { type: "followup"; question: string }
  | { type: "cancel" }
  | { type: "ping" };

/** Background → content script, on the "explain" port. */
export type PortOut =
  | { type: "delta"; text: string }
  | { type: "explained"; explanation: string; tier: Tier }
  | { type: "ask"; name: string; daysAgo: number }
  | { type: "done"; encounterId: string | null; recorded: boolean }
  | { type: "followup_delta"; text: string }
  | { type: "followup_done"; answer: string }
  | { type: "followup_error"; code: ErrorCode; retryAfterMs?: number }
  | { type: "error"; code: ErrorCode; retryAfterMs?: number };

export interface PageInfo {
  /** False when the site is disabled in settings. */
  enabled: boolean;
  /** Scan and enable the selection button as soon as the page loads (arXiv and allow-listed sites). */
  autoScan: boolean;
  /** Reunions may be shown (enabled and not in a private window). */
  scan: boolean;
  incognito: boolean;
  language: Lang;
  /** The explain card and reunion text for `language`, when it is not Chinese or English. */
  strings: Partial<Record<StringKey, string>>;
  theme: Theme;
  /** The configured models, so a failed explanation can be tried with another one. Never carries addresses or keys. */
  models: { id: string; label: string }[];
  entries: MatcherEntry[];
}

/** What the page suggests about being private and what the reader chose about it; see the privacy gate. */
export interface PrivacyFields {
  privacy?: Privacy;
  choice?: Choice;
}

export type Request =
  | { type: "page-info" }
  | { type: "reunions"; sourceId: string; hits: Hit[] }
  | { type: "action"; encounterId: string; action: "marked_understood" | "marked_confused" | "reunion_recalled" }
  | { type: "mute"; conceptId: string }
  | { type: "mark-sensitive"; source: DetectedSource }
  | { type: "mark-normal"; sourceId: string }
  /** The reader chose to send a page that looked private. Refused for a source that is sensitive. */
  | { type: "choose-normal"; source: DetectedSource }
  /** Makes the choice for the whole site this message came from, as a site rule. */
  | { type: "remember-site"; sensitive: boolean }
  | { type: "import-events"; events: HarkEvent[] }
  | { type: "delete-encounter"; encounterId: string }
  | { type: "review-answer"; conceptId: string; action: ReviewAction }
  | { type: "check-answer"; conceptId: string; answer: string }
  | ({ type: "preview-plan"; sourceId: string } & PrivacyFields)
  | ({ type: "preview-terms"; sourceId: string; title: string; text: string } & PrivacyFields)
  | ({ type: "preview-explain"; sourceId: string; title: string; term: string; conceptId: string | null; context: string } & PrivacyFields)
  | { type: "merge-concepts"; fromId: string; intoId: string }
  | { type: "add-alias"; conceptId: string; alias: string }
  | { type: "reject-edge"; edgeId: string }
  | { type: "set-muted"; conceptId: string; muted: boolean }
  | { type: "backup-now" }
  | { type: "settings-changed" };

export interface ResponseMap {
  "page-info": PageInfo;
  reunions: { cards: ReunionCard[] };
  action: { ok: boolean };
  mute: { ok: boolean };
  "mark-sensitive": { ok: boolean };
  "mark-normal": { ok: boolean };
  "choose-normal": { ok: boolean };
  "remember-site": { ok: boolean };
  "import-events": { ok: boolean; added?: number };
  "delete-encounter": { ok: boolean };
  "review-answer": { ok: boolean };
  /** A model's opinion of an answer given from memory. `suggested` is only a hint: the reader grades. */
  "check-answer":
    | { ok: true; verdict: Verdict; feedback: string; suggested: Grade; model: string }
    | { ok: false; code: ErrorCode; retryAfterMs?: number };
  /** Which model a scan of this page would use, and whether it is remote; nothing is sent. */
  "preview-plan": { ok: true; model: string; remote: boolean } | { ok: false; code: ErrorCode; retryAfterMs?: number };
  /** The terms of a page sorted by what the reader knows. Nothing is recorded; `remote` says whether the page text left this machine. */
  "preview-terms":
    { ok: true; terms: PreviewTerm[]; model: string; remote: boolean } | { ok: false; code: ErrorCode; retryAfterMs?: number };
  /** `stored`: the reader's own earlier explanation, no model involved. */
  "preview-explain": { ok: true; explanation: string; stored: boolean } | { ok: false; code: ErrorCode; retryAfterMs?: number };
  "merge-concepts": { ok: boolean };
  /** `collides`: the alias belongs to another concept, so adding it would merge the two. */
  "add-alias": { ok: boolean; collides?: boolean };
  "reject-edge": { ok: boolean };
  "set-muted": { ok: boolean };
  "backup-now": { ok: boolean; error?: string };
  "settings-changed": { ok: boolean };
}

/** Background → content script, via tabs.sendMessage. */
export type TabMessage = { type: "hello" } | { type: "activate" } | { type: "preview" } | { type: "explain-selection" };

const REQUEST_TYPES = new Set<string>([
  "page-info",
  "reunions",
  "action",
  "mute",
  "mark-sensitive",
  "mark-normal",
  "choose-normal",
  "remember-site",
  "import-events",
  "delete-encounter",
  "review-answer",
  "check-answer",
  "preview-plan",
  "preview-terms",
  "preview-explain",
  "merge-concepts",
  "add-alias",
  "reject-edge",
  "set-muted",
  "backup-now",
  "settings-changed",
]);

export function isRequest(m: unknown): m is Request {
  return typeof m === "object" && m !== null && REQUEST_TYPES.has(String((m as { type?: unknown }).type));
}
