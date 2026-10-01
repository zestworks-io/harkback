import { buildFollowUpPrompt, canonicalOrder, serializeJsonl, streamingExplanation, type EventFactory } from "@harkback/core";
import type { HarkEvent } from "@harkback/spec";
import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { applyRetention, backupFilename, EMPTY_BACKUP_STATE, isBackupDue, type BackupState } from "../lib/backup";
import type { LastLookup } from "../lib/cooccurrence";
import {
  buildExplainRecord,
  daysSinceLastEncounter,
  finishExplain,
  planExplain,
  routeFollowUp,
  type ExplainOutcome,
  type ExplainPlan,
  type ExplainRecord,
  type ExplainRequestMsg,
} from "../lib/explain";
import { isRequest, type PortIn, type PortOut, type TabMessage } from "../lib/messages";
import { ModelError, streamChat } from "../lib/model-client";
import { reviewQueue } from "../lib/review";
import { badgeFor } from "../lib/review-badge";
import { RateLimiter, type RateResult } from "../lib/rate-limit";
import { handleRequest, type RequestDeps } from "../lib/requests";
import { fetchAsDataUrl, openReader, type OpenDeps } from "../lib/pdf/open";
import { putHandoff } from "../lib/pdf/handoff";
import { allowed, readerSource, senderKind } from "../lib/sender-auth";
import { withDefaults, type Settings } from "../lib/settings";
import { hostPermissionPatterns, originPattern } from "../lib/site-rules";
import { arxivHtmlUrl } from "../lib/source-id";
import { StateCache } from "../lib/state-cache";
import { CHANGE_CHANNEL, EventStore } from "../lib/store";

const CONTENT_SCRIPT = "/content-scripts/content.js";
const ALLOWLIST_SCRIPT_ID = "allowlist";
const BACKUP_ALARM = "backup";
const BADGE_ALARM = "badge";

type Pending = { outcome: ExplainOutcome; req: ExplainRequestMsg; plan: ExplainPlan };

export default defineBackground(() => {
  const extensionOrigin = self.location.origin;
  let services: Promise<{ store: EventStore; cache: StateCache }> | null = null;
  const getServices = () => (services ??= EventStore.open().then((store) => ({ store, cache: new StateCache(store) })));
  const getState = async () => (await getServices()).cache.get();
  const changes = new BroadcastChannel(CHANGE_CHANNEL);
  const lastLookup = new Map<string, LastLookup>();
  const limiter = new RateLimiter();
  let limiterLoaded = false;

  const loadSettings = async (): Promise<Settings> => withDefaults((await browser.storage.local.get("settings")).settings);

  async function append(build: (f: EventFactory) => HarkEvent[]): Promise<HarkEvent[]> {
    const { store, cache } = await getServices();
    try {
      return await store.append(build);
    } finally {
      cache.invalidate();
      changes.postMessage("changed");
      void refreshBadge();
    }
  }

  /** The toolbar badge counts concepts due for review; it never carries any text from the records. */
  async function refreshBadge(): Promise<void> {
    try {
      const { text, title } = badgeFor(reviewQueue(await getState(), Date.now()).length, (await loadSettings()).language);
      await browser.action.setBadgeText({ text });
      await browser.action.setTitle({ title });
    } catch {
      // The badge is a convenience; a failure must never affect recording.
    }
  }

  /** Optional host permissions are granted at runtime; without one the request would fail with a vague network error. */
  async function canReach(model: { baseUrl: string }): Promise<boolean> {
    const origin = originPattern(model.baseUrl.trim());
    return origin === null || (await browser.permissions.contains({ origins: [origin] }));
  }

  async function acquireRate(settings: Settings): Promise<RateResult> {
    if (!limiterLoaded) {
      const saved: unknown = (await browser.storage.session.get("rateStamps")).rateStamps;
      if (Array.isArray(saved)) limiter.load(saved.filter((t): t is number => typeof t === "number"));
      limiterLoaded = true;
    }
    const result = limiter.tryAcquire(settings.rateLimit, Date.now());
    await browser.storage.session.set({ rateStamps: limiter.stamps() });
    return result;
  }

  // ---- explain port -------------------------------------------------------

  function handleExplainPort(port: Browser.runtime.Port): void {
    const tabKey = String(port.sender?.tab?.id ?? -1);
    const incognito = port.sender?.tab?.incognito === true;
    const senderUrl = port.sender?.url ?? port.sender?.tab?.url ?? "";
    // Site rules and history refer to the PDF the reader shows, not to the reader page.
    const url = senderKind(port.sender ?? {}, browser.runtime.id, extensionOrigin) === "reader" ? readerSource(senderUrl) : senderUrl;
    const abort = new AbortController();
    let pending: Pending | null = null;
    let last: { req: ExplainRequestMsg; plan: ExplainPlan; explanation: string; encounterId: string | null } | null = null;
    let busy = false;
    let closed = false;

    const post = (m: PortOut): void => {
      if (!closed) port.postMessage(m);
    };
    const fail = (e: unknown): void => post({ type: "error", code: e instanceof ModelError ? e.code : "internal" });

    async function record(p: Pending, conceptId: string | null): Promise<void> {
      pending = null;
      const state = await getState();
      const out: { record?: ExplainRecord } = {};
      await append((f) => {
        out.record = buildExplainRecord(f, p.outcome, p.req, conceptId, {
          state,
          model: p.plan.model,
          sensitive: p.plan.sensitive,
          now: Date.now(),
          previous: lastLookup.get(tabKey),
        });
        return out.record.events;
      });
      if (!out.record) return;
      lastLookup.set(tabKey, out.record.lookup);
      if (last) last.encounterId = out.record.encounterId;
      post({ type: "done", encounterId: out.record.encounterId, recorded: true });
    }

    async function start(req: ExplainRequestMsg): Promise<void> {
      busy = true;
      try {
        const settings = await loadSettings();
        const rate = await acquireRate(settings);
        if (!rate.ok) return post({ type: "error", code: "local_rate", retryAfterMs: rate.retryAfterMs });
        const state = await getState();
        const planned = planExplain(req, { url, incognito }, settings, state);
        if (planned.kind === "error") return post({ type: "error", code: planned.code });
        const { plan } = planned;
        if (!(await canReach(plan.model))) return post({ type: "error", code: "no_permission" });
        const raw = await streamChat(
          plan.model,
          plan.prompt.messages,
          (full) => post({ type: "delta", text: streamingExplanation(full) }),
          {
            signal: abort.signal,
          },
        );
        const outcome = finishExplain(raw, plan, req);
        last = { req, plan, explanation: outcome.parsed.explanation, encounterId: null };
        post({ type: "explained", explanation: outcome.parsed.explanation, tier: outcome.tier });
        if (incognito) return post({ type: "done", encounterId: null, recorded: false });
        // Started from a reunion card: the concept is already known.
        const hinted = req.conceptId ? state.representative.get(req.conceptId) : undefined;
        if (outcome.resolution.kind === "ask_user" && !hinted) {
          pending = { outcome, req, plan };
          const c = outcome.resolution.candidate;
          return post({ type: "ask", name: c.canonicalName, daysAgo: daysSinceLastEncounter(state, c.conceptId, Date.now()) });
        }
        await record({ outcome, req, plan }, hinted ?? (outcome.resolution.kind === "existing" ? outcome.resolution.conceptId : null));
      } catch (e) {
        fail(e);
      } finally {
        busy = false;
      }
    }

    async function answer(sameConcept: boolean): Promise<void> {
      const p = pending;
      if (!p) return post({ type: "error", code: "expired" });
      const conceptId = sameConcept && p.outcome.resolution.kind === "ask_user" ? p.outcome.resolution.candidate.conceptId : null;
      try {
        await record(p, conceptId);
      } catch (e) {
        fail(e);
      }
    }

    async function followUp(question: string): Promise<void> {
      const l = last;
      const q = question.trim().slice(0, 2000);
      if (!l || !q) return;
      busy = true;
      try {
        const settings = await loadSettings();
        const rate = await acquireRate(settings);
        if (!rate.ok) return post({ type: "followup_error", code: "local_rate", retryAfterMs: rate.retryAfterMs });
        // The source may have been marked sensitive since the explanation: route again.
        const routed = routeFollowUp(l.req, { url, incognito }, settings, await getState());
        if (routed.kind === "error") return post({ type: "followup_error", code: routed.code });
        if (!(await canReach(routed.model))) return post({ type: "followup_error", code: "no_permission" });
        const messages = buildFollowUpPrompt({
          term: l.req.selection,
          paragraph: l.req.paragraph,
          explanation: l.explanation,
          question: q,
          language: settings.language,
        });
        const reply = await streamChat(routed.model, messages, (full) => post({ type: "followup_delta", text: full }), {
          signal: abort.signal,
        });
        const encounterId = l.encounterId;
        if (encounterId && !incognito) {
          await append((f) => [
            f.make("encounter.action", {
              encounter_id: encounterId,
              action: "followed_up",
              detail: { question: q, answer: reply.slice(0, 20000) },
            }),
          ]);
        }
        post({ type: "followup_done", answer: reply });
      } catch (e) {
        post({ type: "followup_error", code: e instanceof ModelError ? e.code : "internal" });
      } finally {
        busy = false;
      }
    }

    port.onDisconnect.addListener(() => {
      closed = true;
      abort.abort();
      // The explanation was fully received: leaving the "same concept?" question unanswered records a new concept.
      if (pending) void record(pending, null).catch(() => undefined);
    });

    port.onMessage.addListener((msg: PortIn) => {
      if (msg.type === "start" && !busy && !last) void start(msg.request);
      else if (msg.type === "ping")
        return; // Keepalive: receiving it resets the service worker's idle timer.
      else if (msg.type === "answer") void answer(msg.sameConcept === true);
      else if (msg.type === "followup" && !busy && last) void followUp(String(msg.question));
    });
  }

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== "explain") return;
    const kind = senderKind(port.sender ?? {}, browser.runtime.id, extensionOrigin);
    if (kind !== "content" && kind !== "reader") {
      port.disconnect();
      return;
    }
    handleExplainPort(port);
  });

  // ---- one-shot requests --------------------------------------------------

  const requestDeps: RequestDeps = {
    loadSettings,
    getState,
    append,
    async compact() {
      const { store, cache } = await getServices();
      await store.compact();
      cache.invalidate();
    },
    runBackup,
    async syncContentScripts() {
      sync();
      await syncing;
    },
    now: Date.now,
  };

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isRequest(message)) return false;
    const kind = senderKind(sender, browser.runtime.id, extensionOrigin);
    if (!kind || !allowed(message.type, kind)) return false;
    const from = kind === "reader" ? { ...sender, url: readerSource(sender.url) } : sender;
    handleRequest(requestDeps, message, from).then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  });

  // ---- activation ---------------------------------------------------------

  async function ensureContent(tabId: number): Promise<boolean> {
    try {
      if (await browser.tabs.sendMessage(tabId, { type: "hello" } satisfies TabMessage)) return true;
    } catch {
      // Not injected yet.
    }
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
      return true;
    } catch {
      return false;
    }
  }

  function sendToTab(tabId: number, message: TabMessage): void {
    void ensureContent(tabId).then((ok) => (ok ? browser.tabs.sendMessage(tabId, message).catch(() => undefined) : undefined));
  }

  /** An arXiv paper has a better version than its PDF: send the tab to the HTML version. */
  function openHtmlVersion(tab: Browser.tabs.Tab): boolean {
    const html = tab.id !== undefined && tab.url ? arxivHtmlUrl(tab.url) : null;
    if (html) void browser.tabs.update(tab.id!, { url: html });
    return html !== null;
  }

  const openDeps: OpenDeps = {
    readerPage: browser.runtime.getURL("/reader.html"),
    async isPdf(tabId) {
      const [r] = await browser.scripting.executeScript({ target: { tabId }, func: () => document.contentType });
      return r?.result === "application/pdf";
    },
    async download(tabId) {
      const [r] = await browser.scripting.executeScript({ target: { tabId }, func: fetchAsDataUrl });
      return r?.result ?? null;
    },
    stash: (dataUrl) => putHandoff(dataUrl),
    async navigate(tabId, url) {
      await browser.tabs.update(tabId, { url });
    },
  };

  /** The browser's own PDF viewer hides the text from extensions, so a PDF tab is sent to the reader page. */
  const openPdf = (tab: Browser.tabs.Tab): Promise<boolean> => openReader(tab, openDeps).catch(() => false);

  /** Toolbar button and shortcut on a tab: an arXiv PDF goes to its HTML version, any other PDF to the reader, a web page is scanned. */
  function activateTab(tab: Browser.tabs.Tab, message: TabMessage): void {
    if (tab.id === undefined || openHtmlVersion(tab)) return;
    const id = tab.id;
    void openPdf(tab).then((opened) => {
      if (!opened) sendToTab(id, message);
    });
  }

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === "explain-selection" && tab) activateTab(tab, { type: "explain-selection" });
  });

  browser.action.onClicked.addListener((tab) => activateTab(tab, { type: "activate" }));

  async function syncContentScripts(): Promise<void> {
    const settings = await loadSettings();
    const patterns = [
      ...new Set(settings.sites.filter((r) => r.autoScan && !r.disabled).flatMap((r) => hostPermissionPatterns(r.pattern))),
    ];
    const granted: string[] = [];
    for (const p of patterns) if (await browser.permissions.contains({ origins: [p] })) granted.push(p);
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [ALLOWLIST_SCRIPT_ID] });
    if (existing.length > 0) await browser.scripting.unregisterContentScripts({ ids: [ALLOWLIST_SCRIPT_ID] });
    if (granted.length > 0) {
      await browser.scripting.registerContentScripts([
        { id: ALLOWLIST_SCRIPT_ID, matches: granted, js: [CONTENT_SCRIPT.slice(1)], runAt: "document_idle", persistAcrossSessions: true },
      ]);
    }
  }

  // Settings and permission events often arrive together; run the syncs one after another.
  let syncing: Promise<void> = Promise.resolve();
  const sync = () => {
    syncing = syncing.then(syncContentScripts).catch(() => undefined);
  };

  // ---- backup ---------------------------------------------------------------

  async function loadBackupState(): Promise<BackupState> {
    const saved = (await browser.storage.local.get("backupState")).backupState as Partial<BackupState> | undefined;
    return { ...EMPTY_BACKUP_STATE, ...saved };
  }

  async function blobUrl(text: string): Promise<string> {
    if (!(await browser.offscreen.hasDocument())) {
      await browser.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [browser.offscreen.Reason.BLOBS],
        justification: "Create the file for a JSONL backup download",
      });
    }
    const reply = (await browser.runtime.sendMessage({ type: "offscreen:blob-url", text })) as { url?: string } | undefined;
    if (!reply?.url) throw new Error("offscreen document did not answer");
    return reply.url;
  }

  async function runBackup(): Promise<void> {
    const { store } = await getServices();
    const events = await store.all();
    if (events.length === 0) return;
    const { device } = await store.identity();
    const now = Date.now();
    const id = await browser.downloads.download({
      url: await blobUrl(serializeJsonl(canonicalOrder(events))),
      filename: backupFilename(device, now),
      conflictAction: "uniquify",
      saveAs: false,
    });
    const { keep, remove } = applyRetention((await loadBackupState()).downloadIds, id);
    for (const old of remove) {
      await browser.downloads.removeFile(old).catch(() => undefined);
      await browser.downloads.erase({ id: old }).catch(() => undefined);
    }
    await browser.storage.local.set({ backupState: { lastAt: now, downloadIds: keep } satisfies BackupState });
  }

  async function maybeBackup(): Promise<void> {
    const settings = await loadSettings();
    if (settings.backup.enabled && isBackupDue(await loadBackupState(), Date.now())) await runBackup();
  }

  async function ensureAlarm(): Promise<void> {
    if (!(await browser.alarms.get(BACKUP_ALARM)))
      await browser.alarms.create(BACKUP_ALARM, { delayInMinutes: 1, periodInMinutes: 24 * 60 });
    if (!(await browser.alarms.get(BADGE_ALARM))) await browser.alarms.create(BADGE_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
  }

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BACKUP_ALARM) void maybeBackup().catch(() => undefined);
    if (alarm.name === BADGE_ALARM) void refreshBadge();
  });

  // ---- lifecycle ------------------------------------------------------------

  browser.runtime.onInstalled.addListener((details) => {
    void ensureAlarm();
    sync();
    if (details.reason === "install") void browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
  });
  browser.runtime.onStartup.addListener(() => {
    void ensureAlarm();
    sync();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "settings" in changes) {
      sync();
      void refreshBadge();
    }
  });
  // The worker is restarted on demand; keep the badge right whenever it comes up.
  void refreshBadge();
  browser.permissions.onAdded.addListener(sync);
  browser.permissions.onRemoved.addListener(sync);
});
