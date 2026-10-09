import {
  buildCheckPrompt,
  buildPreviewExplainPrompt,
  buildTermsPrompt,
  parseTerms,
  buildFollowUpPrompt,
  canonicalOrder,
  parseCheckReply,
  serializeJsonl,
  streamingExplanation,
  withoutSensitive,
  type EventFactory,
} from "@harkback/core";
import type { HarkEvent } from "@harkback/spec";
import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { applyRetention, backupFilename, EMPTY_BACKUP_STATE, isBackupDue, waitForDownload, type BackupState } from "../lib/storage/backup";
import type { LastLookup } from "../lib/records/cooccurrence";
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
} from "../lib/explain/explain";
import { isRequest, type ErrorCode, type PortIn, type PortOut, type ResponseMap, type TabMessage } from "../lib/messaging/messages";
import { classifyTerms, routePreview, storedExplanation } from "../lib/explain/preview";
import { routeCheck } from "../lib/review/review-check";
import { ModelError, streamChat } from "../lib/models/model-client";
import { reviewQueue } from "../lib/review/review";
import { badgeFor } from "../lib/review/review-badge";
import { RateLimiter, type RateResult } from "../lib/models/rate-limit";
import { handleRequest, type RequestDeps } from "../lib/messaging/requests";
import { fetchAsDataUrl, openReader, type OpenDeps } from "../lib/pdf/open";
import { putHandoff } from "../lib/pdf/handoff";
import { allowed, readerSource, senderKind } from "../lib/messaging/sender-auth";
import { explainLanguageOf, withDefaults, type ModelConfig, type Settings } from "../lib/storage/settings";
import { effectiveRule, hostPermissionPatterns, originPattern, sensitiveBySiteRule } from "../lib/source/site-rules";
import { arxivHtmlUrl } from "../lib/source/source-id";
import { StateCache } from "../lib/storage/state-cache";
import { UI_STRINGS } from "../lib/ui/locales/ui";
import { CHANGE_CHANNEL, EventStore } from "../lib/storage/store";

const CONTENT_SCRIPT = "/content-scripts/content.js";
const ALLOWLIST_SCRIPT_ID = "allowlist";
const BACKUP_ALARM = "backup";
const BADGE_ALARM = "badge";
/** Short enough that the event stays under the size limit even if every character takes four bytes. */
const FOLLOW_UP_ANSWER_CHARS = 12_000;

type Pending = { outcome: ExplainOutcome; req: ExplainRequestMsg; plan: ExplainPlan };

export default defineBackground(() => {
  const extensionOrigin = self.location.origin;
  let services: Promise<{ store: EventStore; cache: StateCache }> | null = null;
  // A failed open is not remembered: the next request tries again.
  const getServices = () =>
    (services ??= EventStore.open()
      .then((store) => ({ store, cache: new StateCache(store) }))
      .catch((e: unknown) => {
        services = null;
        throw e;
      }));
  const getState = async () => (await getServices()).cache.get();
  const changes = new BroadcastChannel(CHANGE_CHANNEL);
  const lastLookup = new Map<string, LastLookup>();
  const limiter = new RateLimiter();
  let limiterLoaded: Promise<void> | undefined;
  // Records are written one after another, each from the state the previous one left, so two tabs never both create the same concept.
  let recording: Promise<unknown> = Promise.resolve();
  const inRecordingOrder = <T>(task: () => Promise<T>): Promise<T> => {
    const run = recording.then(task);
    recording = run.catch(() => undefined);
    return run;
  };

  const timeoutsOf = (s: Settings) => ({
    idleTimeoutMs: s.timeouts.idleSeconds * 1000,
    firstTextTimeoutMs: s.timeouts.firstTextSeconds * 1000,
  });

  const loadSettings = async (): Promise<Settings> => withDefaults((await browser.storage.local.get("settings")).settings);

  async function append(build: (f: EventFactory) => HarkEvent[]): Promise<HarkEvent[]> {
    const { store, cache } = await getServices();
    try {
      return await store.append(build);
    } finally {
      cache.invalidate();
      changes.postMessage("changed");
      scheduleBadge();
    }
  }

  // Several writes in a row (an explanation and its follow-ups) replay the log once, not once each.
  let badgeTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleBadge(): void {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => void refreshBadge(), 1500);
  }

  /** The toolbar badge counts concepts due for review; it never carries any text from the records. */
  async function refreshBadge(): Promise<void> {
    try {
      const settings = await loadSettings();
      const due = reviewQueue(await getState(), Date.now(), { retention: settings.review.desiredRetention });
      const { text, title } = badgeFor(due.length, settings.language);
      await browser.action.setBadgeText({ text });
      await browser.action.setTitle({ title });
    } catch {
      // The badge is a convenience; a failure must never affect recording.
    }
  }

  /** Optional host permissions are granted at runtime; without one the request would fail with a vague network error. */
  async function canReach(model: { baseUrl: string }): Promise<boolean> {
    const origin = originPattern(model.baseUrl.trim());
    if (origin === null) return true;
    // Match patterns cannot name an IPv6 address, so asking about one throws; the request itself then decides.
    return browser.permissions.contains({ origins: [origin] }).catch(() => true);
  }

  async function acquireRate(settings: Settings, now: number): Promise<RateResult> {
    limiterLoaded ??= browser.storage.session.get("rateStamps").then(
      ({ rateStamps }) => {
        if (Array.isArray(rateStamps)) limiter.load(rateStamps.filter((t): t is number => typeof t === "number"));
      },
      (e: unknown) => {
        limiterLoaded = undefined; // a failed read is not remembered
        throw e;
      },
    );
    await limiterLoaded;
    const result = limiter.tryAcquire(settings.rateLimit, now);
    await browser.storage.session.set({ rateStamps: limiter.stamps() });
    return result;
  }

  /** A request that failed before any answer arrived did not use up the budget. */
  async function refundRate(at: number): Promise<void> {
    limiter.release(at);
    await browser.storage.session.set({ rateStamps: limiter.stamps() }).catch(() => undefined);
  }

  // ---- explain port -------------------------------------------------------

  function handleExplainPort(port: Browser.runtime.Port): void {
    const tabKey = String(port.sender?.tab?.id ?? -1);
    const incognito = port.sender?.tab?.incognito === true;
    const senderUrl = port.sender?.url ?? port.sender?.tab?.url ?? "";
    // Site rules and history refer to the PDF the reader shows, not to the reader page.
    const url = senderKind(port.sender ?? {}, browser.runtime.id, extensionOrigin) === "reader" ? readerSource(senderUrl) : senderUrl;
    // One controller per model call, so Stop ends the current answer and a later question starts fresh.
    let active: AbortController | null = null;
    const begin = (): AbortSignal => (active = new AbortController()).signal;
    let pending: Pending | null = null;
    type Turn = { question: string; answer: string };
    let last: {
      req: ExplainRequestMsg;
      plan: ExplainPlan;
      explanation: string;
      encounterId: string | null;
      /** Follow-ups answered before the explanation was recorded. */
      unsaved: Turn[];
    } | null = null;
    let busy = false;
    let closed = false;

    const post = (m: PortOut): void => {
      if (!closed) port.postMessage(m);
    };
    // The explanation is already on screen; a failed write must not replace it with an error.
    const unrecorded = (): void => post({ type: "done", encounterId: null, recorded: false });
    const fail = (e: unknown): void => post({ type: "error", code: e instanceof ModelError ? e.code : "internal" });

    const record = (p: Pending, conceptId: string | null): Promise<void> => {
      pending = null;
      return inRecordingOrder(() => write(p, conceptId));
    };

    async function write(p: Pending, conceptId: string | null): Promise<void> {
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
      if (last) {
        last.encounterId = out.record.encounterId;
        const waiting = last.unsaved.splice(0);
        for (const turn of waiting) await saveFollowUp(out.record.encounterId, turn).catch(() => undefined);
      }
      post({ type: "done", encounterId: out.record.encounterId, recorded: true });
    }

    const saveFollowUp = (encounterId: string, turn: Turn): Promise<unknown> =>
      append((f) => [f.make("encounter.action", { encounter_id: encounterId, action: "followed_up", detail: turn })]);

    async function start(req: ExplainRequestMsg): Promise<void> {
      busy = true;
      try {
        const settings = await loadSettings();
        const state = await getState();
        const planned = planExplain(req, { url, incognito }, settings, state);
        if (planned.kind === "error") return post({ type: "error", code: planned.code });
        const { plan } = planned;
        if (!(await canReach(plan.model))) return post({ type: "error", code: "no_permission" });
        const asked = Date.now();
        const rate = await acquireRate(settings, asked);
        if (!rate.ok) return post({ type: "error", code: "local_rate", retryAfterMs: rate.retryAfterMs });
        const raw = await streamChat(
          plan.model,
          plan.prompt.messages,
          (full) => post({ type: "delta", text: streamingExplanation(full) }),
          { signal: begin(), ...timeoutsOf(settings) },
        ).catch(async (e: unknown) => {
          await refundRate(asked);
          throw e;
        });
        // The model took a while: join against what is recorded now, not what was when the request started.
        const outcome = finishExplain(raw, plan, req, await getState());
        last = { req, plan, explanation: outcome.parsed.explanation, encounterId: null, unsaved: [] };
        post({ type: "explained", explanation: outcome.parsed.explanation, tier: outcome.tier });
        if (incognito) return post({ type: "done", encounterId: null, recorded: false });
        // Started from a reunion card: the concept is already known.
        const hinted = req.conceptId ? state.representative.get(req.conceptId) : undefined;
        if (outcome.resolution.kind === "ask_user" && !hinted) {
          pending = { outcome, req, plan };
          const c = outcome.resolution.candidate;
          return post({ type: "ask", name: c.canonicalName, daysAgo: daysSinceLastEncounter(state, c.conceptId, Date.now()) });
        }
        await record(
          { outcome, req, plan },
          hinted ?? (outcome.resolution.kind === "existing" ? outcome.resolution.conceptId : null),
        ).catch(unrecorded);
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
      await record(p, conceptId).catch(unrecorded);
    }

    async function followUp(question: string): Promise<void> {
      const l = last;
      const q = question.trim().slice(0, 2000);
      if (!l || !q) return;
      busy = true;
      try {
        const settings = await loadSettings();
        // The source may have been marked sensitive since the explanation: route again.
        const routed = routeFollowUp(l.req, { url, incognito }, settings, await getState());
        if (routed.kind === "error") return post({ type: "followup_error", code: routed.code });
        if (!(await canReach(routed.model))) return post({ type: "followup_error", code: "no_permission" });
        const asked = Date.now();
        const rate = await acquireRate(settings, asked);
        if (!rate.ok) return post({ type: "followup_error", code: "local_rate", retryAfterMs: rate.retryAfterMs });
        const messages = buildFollowUpPrompt({
          term: l.req.selection,
          paragraph: l.req.paragraph,
          explanation: l.explanation,
          question: q,
          language: explainLanguageOf(settings),
        });
        const reply = await streamChat(routed.model, messages, (full) => post({ type: "followup_delta", text: full }), {
          signal: begin(),
          ...timeoutsOf(settings),
        }).catch(async (e: unknown) => {
          await refundRate(asked);
          throw e;
        });
        const turn = { question: q, answer: reply.slice(0, FOLLOW_UP_ANSWER_CHARS) };
        if (!incognito) {
          // Until the explanation itself is recorded there is nothing to attach the conversation to; it is saved right after.
          if (l.encounterId) await saveFollowUp(l.encounterId, turn);
          else l.unsaved.push(turn);
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
      active?.abort();
      // The explanation was fully received: leaving the "same concept?" question unanswered records a new concept.
      if (pending) void record(pending, null).catch(() => undefined);
    });

    port.onMessage.addListener((msg: PortIn) => {
      if (msg.type === "start" && !busy && !last) void start(msg.request);
      else if (msg.type === "ping")
        return; // Keepalive: receiving it resets the service worker's idle timer.
      else if (msg.type === "cancel") active?.abort();
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

  /** "Check my answer" in review: one model call, never recorded; only the grade the reader then picks is. */
  async function checkAnswer(conceptId: string, answer: string): Promise<ResponseMap["check-answer"]> {
    const settings = await loadSettings();
    const routed = routeCheck(settings, await getState(), conceptId);
    if (routed.kind === "error") return { ok: false, code: routed.code };
    if (!(await canReach(routed.model))) return { ok: false, code: "no_permission" };
    const asked = Date.now();
    const rate = await acquireRate(settings, asked);
    if (!rate.ok) return { ok: false, code: "local_rate", retryAfterMs: rate.retryAfterMs };
    try {
      const messages = buildCheckPrompt({
        term: routed.term,
        explanation: routed.explanation,
        answer,
        language: explainLanguageOf(settings),
      });
      const raw = await streamChat(routed.model, messages, () => undefined, timeoutsOf(settings));
      const result = parseCheckReply(raw);
      if (!result) {
        // The model answered, but not in the format asked for; that is no use of the reader's budget.
        await refundRate(asked);
        return { ok: false, code: "http" };
      }
      return { ok: true, ...result, model: routed.model.label };
    } catch (e) {
      await refundRate(asked);
      return { ok: false, code: e instanceof ModelError ? e.code : "internal" };
    }
  }

  /**
   * Both preview calls: route by the page's sensitivity, check access and the rate limit, ask once. `read` turns the reply into
   * a result, or null when it is no use; then, like a failed call, the slot is given back.
   */
  async function previewModel<T>(
    url: string,
    sourceId: string,
    ask: (model: ModelConfig, settings: Settings) => Promise<string>,
    read: (raw: string) => T | null,
  ): Promise<{ ok: true; value: T; model: ModelConfig; remote: boolean } | { ok: false; code: ErrorCode; retryAfterMs?: number }> {
    const settings = await loadSettings();
    const routed = routePreview(settings, await getState(), url, sourceId);
    if (routed.kind === "error") return { ok: false, code: routed.code };
    if (!(await canReach(routed.model))) return { ok: false, code: "no_permission" };
    const asked = Date.now();
    const rate = await acquireRate(settings, asked);
    if (!rate.ok) return { ok: false, code: "local_rate", retryAfterMs: rate.retryAfterMs };
    try {
      const value = read(await ask(routed.model, settings));
      if (value === null) {
        await refundRate(asked);
        return { ok: false, code: "http" };
      }
      return { ok: true, value, model: routed.model, remote: routed.remote };
    } catch (e) {
      await refundRate(asked);
      return { ok: false, code: e instanceof ModelError ? e.code : "internal" };
    }
  }

  async function previewPlan(req: Parameters<RequestDeps["previewPlan"]>[0]): Promise<ResponseMap["preview-plan"]> {
    const routed = routePreview(await loadSettings(), await getState(), req.url, req.sourceId);
    return routed.kind === "ok" ? { ok: true, model: routed.model.label, remote: routed.remote } : { ok: false, code: routed.code };
  }

  async function previewTerms(req: Parameters<RequestDeps["previewTerms"]>[0]): Promise<ResponseMap["preview-terms"]> {
    const result = await previewModel(
      req.url,
      req.sourceId,
      (model, settings) =>
        streamChat(
          model,
          buildTermsPrompt({ pageTitle: req.title, pageText: req.text, language: explainLanguageOf(settings) }),
          () => undefined,
          timeoutsOf(settings),
        ),
      (raw) => {
        const terms = parseTerms(raw);
        return terms.length > 0 ? terms : null;
      },
    );
    if (!result.ok) return result;
    // A private window never reads the records, so every term is new there.
    const sorted = req.incognito
      ? result.value.map((term) => ({ term, conceptId: null, name: term, status: "new" as const }))
      : classifyTerms(await getState(), result.value, Date.now());
    return { ok: true, terms: sorted, model: result.model.label, remote: result.remote };
  }

  async function previewExplain(req: Parameters<RequestDeps["previewExplain"]>[0]): Promise<ResponseMap["preview-explain"]> {
    if (req.conceptId) {
      // A panel left open after the site was turned off no longer shows the reader's records.
      if (effectiveRule((await loadSettings()).sites, req.url).disabled) return { ok: false, code: "site_disabled" };
      const stored = storedExplanation(await getState(), req.conceptId);
      if (stored === null) return { ok: false, code: "expired" };
      return { ok: true, explanation: stored, stored: true };
    }
    const result = await previewModel(
      req.url,
      req.sourceId,
      (model, settings) =>
        streamChat(
          model,
          buildPreviewExplainPrompt({ term: req.term, pageTitle: req.title, context: req.context, language: explainLanguageOf(settings) }),
          () => undefined,
          timeoutsOf(settings),
        ),
      // Only the tags of the reply format are removed: an explanation may contain "x < 3 and y > 2".
      (raw) => raw.replace(/<\/?(?:explanation|terms?)>/gi, "").trim() || null,
    );
    return result.ok ? { ok: true, explanation: result.value, stored: false } : result;
  }

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
    checkAnswer,
    previewPlan,
    previewTerms,
    previewExplain,
    async importEvents(events) {
      const { store, cache } = await getServices();
      try {
        return await store.importEvents(events);
      } finally {
        cache.invalidate();
        changes.postMessage("changed");
        scheduleBadge();
      }
    },
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
    else if (command === "preview-page" && tab) activateTab(tab, { type: "preview" });
  });

  browser.action.onClicked.addListener((tab) => activateTab(tab, { type: "preview" }));

  const MENU_ID = "explain-selection";
  const PREVIEW_MENU_ID = "preview-page";
  const menuTitle = (lang: Settings["language"]): string =>
    `Harkback: ${UI_STRINGS[lang]?.explain ?? (lang === "zh" ? "解释" : "Explain")}`;
  const previewMenuTitle = (lang: Settings["language"]): string =>
    `Harkback: ${UI_STRINGS[lang]?.previewTitle ?? (lang === "zh" ? "预览本页概念" : "Preview this page")}`;

  /** Creates the right-click entries, or renames them when the interface language changed. */
  async function ensureMenu(): Promise<void> {
    const { language } = await loadSettings();
    const entries: { id: string; title: string; contexts: ["selection"] | ["page"] }[] = [
      { id: MENU_ID, title: menuTitle(language), contexts: ["selection"] },
      { id: PREVIEW_MENU_ID, title: previewMenuTitle(language), contexts: ["page"] },
    ];
    for (const { id, title, contexts } of entries) {
      try {
        await browser.contextMenus.update(id, { title });
      } catch {
        browser.contextMenus.create({ id, title, contexts }, () => void browser.runtime.lastError);
      }
    }
  }

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab) return;
    if (info.menuItemId === MENU_ID) activateTab(tab, { type: "explain-selection" });
    else if (info.menuItemId === PREVIEW_MENU_ID) activateTab(tab, { type: "preview" });
  });

  async function syncContentScripts(): Promise<void> {
    const settings = await loadSettings();
    const patterns = [
      ...new Set(settings.sites.filter((r) => r.autoScan && !r.disabled).flatMap((r) => hostPermissionPatterns(r.pattern))),
    ];
    const granted: string[] = [];
    for (const p of patterns) if (await browser.permissions.contains({ origins: [p] })) granted.push(p);
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [ALLOWLIST_SCRIPT_ID] });
    if (granted.length === 0) {
      if (existing.length > 0) await browser.scripting.unregisterContentScripts({ ids: [ALLOWLIST_SCRIPT_ID] });
      return;
    }
    // Updating in place keeps the old registration if the new patterns are rejected.
    const script = {
      id: ALLOWLIST_SCRIPT_ID,
      matches: granted,
      js: [CONTENT_SCRIPT.slice(1)],
      runAt: "document_idle" as const,
      persistAcrossSessions: true,
    };
    if (existing.length > 0) await browser.scripting.updateContentScripts([script]);
    else await browser.scripting.registerContentScripts([script]);
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

  // The alarm and the "back up now" button can fire together; two runs at once would overwrite each other's download list.
  let backingUp: Promise<unknown> = Promise.resolve();
  function runBackup(): Promise<void> {
    const run = backingUp.then(writeBackup);
    backingUp = run.catch(() => undefined);
    return run;
  }

  async function writeBackup(): Promise<void> {
    const { store } = await getServices();
    const all = await store.all();
    const settings = await loadSettings();
    const events = settings.backup.excludeSensitive ? withoutSensitive(all, (s) => sensitiveBySiteRule(settings.sites, s)) : all;
    if (events.length === 0) return;
    const { device } = await store.identity();
    const now = Date.now();
    const id = await browser.downloads.download({
      url: await blobUrl(serializeJsonl(canonicalOrder(events))),
      filename: backupFilename(device, now),
      conflictAction: "uniquify",
      saveAs: false,
    });
    const before = await loadBackupState();
    // Tracked from the moment it starts, so a worker restart while waiting does not lose track of the file.
    await browser.storage.local.set({ backupState: { ...before, downloadIds: [...before.downloadIds, id] } satisfies BackupState });
    // Older backups are only removed once the new one is safely on disk.
    if ((await waitForDownload(browser.downloads, id)) !== "complete") {
      await browser.downloads.erase({ id }).catch(() => undefined);
      await browser.storage.local.set({ backupState: before satisfies BackupState });
      throw new Error("the backup file could not be written");
    }
    const { keep, remove } = applyRetention(before.downloadIds, id);
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
    void ensureMenu();
    sync();
    if (details.reason === "install") void browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
  });
  browser.runtime.onStartup.addListener(() => {
    void ensureAlarm();
    void ensureMenu();
    sync();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "settings" in changes) {
      sync();
      void ensureMenu();
      void refreshBadge();
    }
  });
  // The worker is restarted on demand; keep the badge right whenever it comes up.
  void refreshBadge();
  browser.permissions.onAdded.addListener(sync);
  browser.permissions.onRemoved.addListener(sync);
});
