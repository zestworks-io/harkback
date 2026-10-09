import {
  acronymOf,
  clampSource,
  identityKey,
  matcherEntriesFromState,
  MAX_PREVIEW_PAGE_CHARS,
  REVIEW_ACTIONS,
  type EventFactory,
  type Hit,
  type State,
} from "@harkback/core";
import { CARD_LIMITS, parseEvent, type HarkEvent } from "@harkback/spec";
import type { PageInfo, Request, ResponseMap } from "./messages";
import { reunionCards } from "../records/reunion-cards";
import type { SenderInfo } from "./sender-auth";
import type { Settings } from "../storage/settings";
import { effectiveRule } from "../source/site-rules";
import { isArxivUrl } from "../source/source-id";
import { UI_STRINGS } from "../ui/locales/ui";

const USER_ACTIONS = new Set(["marked_understood", "marked_confused", "reunion_recalled"]);
const REVIEW_ANSWERS = new Set<string>(REVIEW_ACTIONS);
const MAX_HITS = 500;
const MAX_ANSWER_CHARS = 2000;
const MAX_TERM_CHARS = 200;

/** What the one-shot request handlers need from the background page; tests supply fakes. */
export interface RequestDeps {
  loadSettings(): Promise<Settings>;
  getState(): Promise<State>;
  append(build: (f: EventFactory) => HarkEvent[]): Promise<HarkEvent[]>;
  /** Erases the payloads of deleted encounters and refreshes the cached state. */
  compact(): Promise<void>;
  /** Adds events from a backup; the ones already present are skipped. Returns how many were new. */
  importEvents(events: HarkEvent[]): Promise<number>;
  runBackup(): Promise<void>;
  /** Asks the model whether a typed answer matches the stored explanation; the model, rate limit and sensitivity rules are the background's. */
  checkAnswer(conceptId: string, answer: string): Promise<ResponseMap["check-answer"]>;
  /** Which model a scan would use, without sending anything. */
  previewPlan(req: { url: string; sourceId: string }): Promise<ResponseMap["preview-plan"]>;
  /** Asks a model for the key terms of a page and sorts them by what the reader knows; nothing is recorded. */
  previewTerms(req: {
    url: string;
    sourceId: string;
    title: string;
    text: string;
    incognito: boolean;
  }): Promise<ResponseMap["preview-terms"]>;
  /** A stored explanation, or a model's short one for a term never looked up; nothing is recorded. */
  previewExplain(req: {
    url: string;
    sourceId: string;
    title: string;
    term: string;
    conceptId: string | null;
    context: string;
  }): Promise<ResponseMap["preview-explain"]>;
  syncContentScripts(): Promise<void>;
  now(): number;
}

function isHit(h: unknown): h is Hit {
  const x = h as Hit | null;
  return typeof x?.key === "string" && typeof x.text === "string" && Number.isInteger(x.start) && Number.isInteger(x.end);
}

export async function pageInfo(deps: RequestDeps, url: string, incognito: boolean): Promise<PageInfo> {
  const settings = await deps.loadSettings();
  const rule = effectiveRule(settings.sites, url);
  const enabled = !rule.disabled;
  const scan = enabled && !incognito;
  return {
    enabled,
    autoScan: enabled && (rule.autoScan || isArxivUrl(url)),
    scan,
    incognito,
    language: settings.language,
    strings: UI_STRINGS[settings.language] ?? {},
    theme: settings.theme,
    models: settings.models.map((m) => ({ id: m.id, label: m.label })),
    entries: scan ? matcherEntriesFromState(await deps.getState()) : [],
  };
}

/** Private windows explain but never record and never show reunions; every write below refuses them. */
export async function handleRequest(deps: RequestDeps, msg: Request, sender: SenderInfo): Promise<ResponseMap[Request["type"]]> {
  const incognito = sender.tab?.incognito === true;
  switch (msg.type) {
    case "page-info":
      return pageInfo(deps, sender.url ?? "", incognito);
    case "reunions": {
      const settings = await deps.loadSettings();
      if (incognito || effectiveRule(settings.sites, sender.url ?? "").disabled || !Array.isArray(msg.hits)) return { cards: [] };
      const hits = msg.hits.filter(isHit).slice(0, MAX_HITS);
      return { cards: reunionCards(await deps.getState(), hits, { sourceId: String(msg.sourceId), now: deps.now(), ...settings.reunion }) };
    }
    case "action": {
      if (incognito || !USER_ACTIONS.has(msg.action) || !(await deps.getState()).encounters.has(msg.encounterId)) return { ok: false };
      await deps.append((f) => [f.make("encounter.action", { encounter_id: msg.encounterId, action: msg.action })]);
      return { ok: true };
    }
    case "mute": {
      const rep = (await deps.getState()).representative.get(msg.conceptId);
      if (incognito || !rep) return { ok: false };
      await deps.append((f) => [f.make("concept.muted", { concept_id: rep })]);
      return { ok: true };
    }
    case "mark-sensitive": {
      if (incognito) return { ok: false };
      await deps.append((f) => [f.make("source.seen", clampSource(msg.source, "sensitive", true))]);
      return { ok: true };
    }
    case "mark-normal": {
      const src = (await deps.getState()).sources.get(String(msg.sourceId));
      if (!src || src.sensitivity !== "sensitive") return { ok: false };
      const detected = { source_id: src.id, ids: src.ids, title: src.title, license: src.license };
      await deps.append((f) => [f.make("source.seen", clampSource(detected, "normal", true))]);
      return { ok: true };
    }
    case "import-events": {
      if (!Array.isArray(msg.events)) return { ok: false };
      // The page parsed them, but a message is not a trusted channel: check each event again.
      const events = msg.events.flatMap((e) => {
        const r = parseEvent(e);
        return r.kind === "event" ? [r.event] : [];
      });
      return { ok: true, added: await deps.importEvents(events) };
    }
    case "delete-encounter": {
      if (!(await deps.getState()).encounters.has(msg.encounterId)) return { ok: false };
      await deps.append((f) => [f.make("encounter.deleted", { encounter_id: msg.encounterId })]);
      await deps.compact();
      return { ok: true };
    }
    case "review-answer": {
      const state = await deps.getState();
      const rep = state.representative.get(msg.conceptId);
      const encounterId = rep ? state.encountersByConcept.get(rep)?.at(-1) : undefined;
      if (!encounterId || !REVIEW_ANSWERS.has(msg.action)) return { ok: false };
      await deps.append((f) => [f.make("encounter.action", { encounter_id: encounterId, action: msg.action })]);
      return { ok: true };
    }
    case "check-answer": {
      const answer = typeof msg.answer === "string" ? msg.answer.trim().slice(0, MAX_ANSWER_CHARS) : "";
      if (!answer) return { ok: false, code: "internal" };
      return deps.checkAnswer(String(msg.conceptId), answer);
    }
    case "preview-plan":
      return deps.previewPlan({ url: sender.url ?? "", sourceId: String(msg.sourceId) });
    case "preview-terms": {
      const text = typeof msg.text === "string" ? msg.text.slice(0, MAX_PREVIEW_PAGE_CHARS) : "";
      if (!text.trim()) return { ok: false, code: "internal" };
      return deps.previewTerms({ url: sender.url ?? "", sourceId: String(msg.sourceId), title: String(msg.title ?? ""), text, incognito });
    }
    case "preview-explain": {
      const term = typeof msg.term === "string" ? msg.term.trim().slice(0, MAX_TERM_CHARS) : "";
      if (!term) return { ok: false, code: "internal" };
      return deps.previewExplain({
        url: sender.url ?? "",
        sourceId: String(msg.sourceId),
        title: String(msg.title ?? ""),
        term,
        // A private window never reads the records.
        conceptId: incognito || typeof msg.conceptId !== "string" ? null : msg.conceptId,
        context: typeof msg.context === "string" ? msg.context.slice(0, 2000) : "",
      });
    }
    case "merge-concepts": {
      const { representative } = await deps.getState();
      const from = representative.get(msg.fromId);
      const into = representative.get(msg.intoId);
      if (!from || !into || from === into) return { ok: false };
      await deps.append((f) => [f.make("concept.merged", { from, into })]);
      return { ok: true };
    }
    case "add-alias": {
      const state = await deps.getState();
      const rep = state.representative.get(msg.conceptId);
      const alias = typeof msg.alias === "string" ? msg.alias.trim() : "";
      if (!rep || !alias || alias.length > CARD_LIMITS.maxNameLength) return { ok: false };
      const key = identityKey(alias);
      if (!key) return { ok: false };
      if (state.concepts.get(rep)!.names.some((n) => identityKey(n) === key)) return { ok: true };
      // Replay merges concepts that share a name or an abbreviation, so such an alias would merge them without asking.
      const acronym = acronymOf(alias);
      const keys = [key, ...(acronym && acronym.length >= 3 ? [identityKey(acronym)] : [])];
      if (keys.some((k) => state.aliases.get(k)?.conceptIds.some((id) => id !== rep))) return { ok: false, collides: true };
      await deps.append((f) => [f.make("concept.alias_added", { concept_id: rep, alias })]);
      return { ok: true };
    }
    case "reject-edge": {
      if (!(await deps.getState()).edges.has(String(msg.edgeId))) return { ok: false };
      await deps.append((f) => [f.make("edge.rejected", { edge_id: msg.edgeId })]);
      return { ok: true };
    }
    case "set-muted": {
      const rep = (await deps.getState()).representative.get(msg.conceptId);
      if (incognito || !rep) return { ok: false };
      await deps.append((f) => [f.make(msg.muted === true ? "concept.muted" : "concept.unmuted", { concept_id: rep })]);
      return { ok: true };
    }
    case "backup-now":
      try {
        await deps.runBackup();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    case "settings-changed":
      await deps.syncContentScripts();
      return { ok: true };
  }
}
