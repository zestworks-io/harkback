import { clampSource, matcherEntriesFromState, type EventFactory, type Hit, type State } from "@harkback/core";
import type { HarkEvent } from "@harkback/spec";
import type { PageInfo, Request, ResponseMap } from "./messages";
import { reunionCards } from "./reunion-cards";
import type { SenderInfo } from "./sender-auth";
import type { Settings } from "./settings";
import { effectiveRule } from "./site-rules";
import { isArxivUrl } from "./source-id";

const USER_ACTIONS = new Set(["marked_understood", "marked_confused", "reunion_recalled"]);
const MAX_HITS = 500;

/** What the one-shot request handlers need from the background page; tests supply fakes. */
export interface RequestDeps {
  loadSettings(): Promise<Settings>;
  getState(): Promise<State>;
  append(build: (f: EventFactory) => HarkEvent[]): Promise<HarkEvent[]>;
  /** Erases the payloads of deleted encounters and refreshes the cached state. */
  compact(): Promise<void>;
  runBackup(): Promise<void>;
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
      await deps.append((f) => [f.make("source.seen", clampSource(msg.source, "sensitive"))]);
      return { ok: true };
    }
    case "delete-encounter": {
      if (!(await deps.getState()).encounters.has(msg.encounterId)) return { ok: false };
      await deps.append((f) => [f.make("encounter.deleted", { encounter_id: msg.encounterId })]);
      await deps.compact();
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
