import type { Hit, MatcherEntry } from "@harkback/core";
import type { Tier } from "@harkback/spec";
import type { ExplainRequestMsg, PlanError } from "./explain";
import type { ModelErrorCode } from "./model-client";
import type { ReunionCard } from "./reunion-cards";
import type { Theme } from "./settings";
import type { DetectedSource } from "./source-id";
import type { Lang, StringKey } from "./ui/strings";

export type ErrorCode = PlanError | ModelErrorCode | "local_rate" | "no_permission" | "expired" | "internal";

/** Content script → background, on the "explain" port. */
export type PortIn =
  | { type: "start"; request: ExplainRequestMsg }
  | { type: "answer"; sameConcept: boolean }
  | { type: "followup"; question: string }
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
  entries: MatcherEntry[];
}

export type Request =
  | { type: "page-info" }
  | { type: "reunions"; sourceId: string; hits: Hit[] }
  | { type: "action"; encounterId: string; action: "marked_understood" | "marked_confused" | "reunion_recalled" }
  | { type: "mute"; conceptId: string }
  | { type: "mark-sensitive"; source: DetectedSource }
  | { type: "delete-encounter"; encounterId: string }
  | { type: "review-answer"; conceptId: string; action: "marked_understood" | "marked_confused" }
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
  "delete-encounter": { ok: boolean };
  "review-answer": { ok: boolean };
  "merge-concepts": { ok: boolean };
  /** `collides`: the alias belongs to another concept, so adding it would merge the two. */
  "add-alias": { ok: boolean; collides?: boolean };
  "reject-edge": { ok: boolean };
  "set-muted": { ok: boolean };
  "backup-now": { ok: boolean; error?: string };
  "settings-changed": { ok: boolean };
}

/** Background → content script, via tabs.sendMessage. */
export type TabMessage = { type: "hello" } | { type: "activate" } | { type: "explain-selection" };

const REQUEST_TYPES = new Set<string>([
  "page-info",
  "reunions",
  "action",
  "mute",
  "mark-sensitive",
  "delete-encounter",
  "review-answer",
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
