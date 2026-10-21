import type { ResponseMap } from "../messaging/messages";
import { h } from "../ui/dom";
import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";
import { errorText } from "../ui/strings";

export interface ExplainImportedDeps {
  lang(): Lang;
  /** The look-ups recorded without an explanation, as the records stand now. */
  pending(): string[];
  explain(encounterId: string): Promise<ResponseMap["explain-imported"] | { ok: false; error?: string }>;
  /** Reads the records again, when a run ends. */
  reload(): Promise<void>;
  draw(): void;
  sleep?(ms: number): Promise<void>;
}

/** A wait the rate limit asks for is sat out up to this long; a longer one ends the run. */
const MAX_RATE_WAIT_MS = 120_000;

/**
 * The note above History about terms imported from Zotero that are not explained yet, with a button that explains them one
 * by one with the reader's model. It keeps its progress while the page is drawn again after each explanation.
 */
export function explainImported(deps: ExplainImportedDeps): { view(): HTMLElement | null } {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let run: {
    total: number;
    done: number;
    failed: number;
    waiting: boolean;
    /** Ends a wait for the rate limit early. */
    wake: (() => void) | null;
    stopped: boolean;
    finished: boolean;
    error: string;
  } | null = null;

  async function start(): Promise<void> {
    const ids = deps.pending();
    run = { total: ids.length, done: 0, failed: 0, waiting: false, wake: null, stopped: false, finished: false, error: "" };
    const r = run;
    deps.draw();
    for (const id of ids) {
      if (r.stopped) break;
      for (;;) {
        const res = await deps.explain(id).catch(() => ({ ok: false as const }));
        if (res.ok) {
          r.done++;
          break;
        }
        const code = "code" in res ? res.code : "internal";
        const wait = "retryAfterMs" in res ? (res.retryAfterMs ?? 0) : 0;
        // The rate limit set in Settings: wait for it rather than give up on the rest; a long wait ends the run instead,
        // leaving the rest to explain later.
        if (code === "local_rate" && wait > MAX_RATE_WAIT_MS) {
          r.stopped = true;
          r.error = errorText(deps.lang(), code, wait);
          break;
        }
        if (code === "local_rate" && !r.stopped) {
          r.waiting = true;
          deps.draw();
          // Stop ends the wait too, rather than leaving the reader looking at it for up to two minutes.
          await Promise.race([sleep(wait + 250), new Promise<void>((resolve) => (r.wake = resolve))]);
          r.wake = null;
          r.waiting = false;
          if (r.stopped) break;
          continue;
        }
        // Stopped while the model was being asked: the answer it gave is no failure of the term.
        if (r.stopped) break;
        // One that cannot be explained (a sensitive source with no local model, say) does not stop the others.
        if (code !== "expired") {
          r.failed++;
          r.error = errorText(deps.lang(), code, wait);
        }
        break;
      }
      deps.draw();
    }
    r.finished = true;
    // Read once at the end, not after each term: the page already follows each explanation as it is recorded.
    await deps.reload().catch(() => undefined);
    deps.draw();
  }

  function view(): HTMLElement | null {
    const lang = deps.lang();
    const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
    const pending = deps.pending().length;
    if (!run && pending === 0) return null;
    const parts: (Node | string)[] = [];
    if (run && !run.finished) {
      parts.push(
        run.waiting
          ? L("已解释 {done} / {total}，正在等待速率限制…", "Explained {done} of {total}; waiting for the rate limit…", {
              done: run.done,
              total: run.total,
            })
          : L("正在解释 {done} / {total}…", "Explaining {done} of {total}…", { done: run.done, total: run.total }),
      );
      const stop = h("button", { type: "button", className: "small", "data-hb": "explain-imported-stop" }, L("停止", "Stop"));
      stop.disabled = run.stopped;
      stop.addEventListener("click", () => {
        run!.stopped = true;
        run!.wake?.();
        deps.draw();
      });
      parts.push(" ", stop);
    } else {
      if (run?.finished) {
        parts.push(
          run.failed > 0
            ? L("已解释：{done}。无法解释：{failed}。{error}", "Explained: {done}. Could not explain: {failed}. {error}", {
                done: run.done,
                failed: run.failed,
                error: run.error,
              })
            : L("已解释：{done}。", "Explained: {done}.", { done: run.done }),
        );
        // Stopped by a long wait for the rate limit: say so.
        if (run.failed === 0 && run.error) parts.push(" ", run.error);
        if (pending > 0) parts.push(" ");
      }
      if (pending > 0) {
        parts.push(L("从 Zotero 导入的查词中，还没解释过的：{n}。", "Look-ups from Zotero not explained yet: {n}.", { n: pending }), " ");
        const go = h(
          "button",
          { type: "button", className: "small", "data-hb": "explain-imported" },
          L("用我的模型解释它们", "Explain them with my model"),
        );
        go.addEventListener("click", () => void start());
        parts.push(go);
      }
    }
    return h("p", { className: "note explain-imported", role: "status", "data-hb": "explain-imported-bar" }, ...parts);
  }

  return { view };
}
