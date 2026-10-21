import { nextDueAt, reviewQueue } from "../review/review";
import type { Grade, ReviewAction, State } from "@harkback/core";
import { browser } from "wxt/browser";
import type { ResponseMap } from "../messaging/messages";
import type { Understanding } from "../records/concept-detail";
import { clozeHint } from "../review/cloze";
import { daysText, dueText } from "../review/due";
import { routeCheck } from "../review/review-check";
import type { Settings } from "../storage/settings";
import { h } from "../ui/dom";
import { quoteTitle } from "../ui/languages";
import { renderMarkdown } from "../ui/markdown";
import { pick } from "../ui/pick";
import { errorText } from "../ui/strings";
import { request } from "./request";

export interface ReviewViewDeps {
  state(): State;
  settings: Settings;
  /** Reads the records again and draws the page. */
  reload(): Promise<void>;
  draw(): void;
  setStatus(text: string): void;
  names(canonical: string, aliases: readonly string[]): { name: string; aliases: string[] };
  badge(u: Understanding): HTMLElement;
  sourceLink(title: string, url: string | null): HTMLElement;
  timestamp(t: number | null): HTMLElement | null;
  gapsNote(conceptId: string): HTMLElement | null;
  conceptHref(id: string): string;
}

/**
 * The review page: one due term at a time, shown, answered from memory (optionally checked by a model) and graded. It keeps
 * its own place (what was revealed, skipped and typed) while the page is drawn again.
 */
export function createReview(deps: ReviewViewDeps): { view(): HTMLElement; onKey(e: KeyboardEvent): void; dueCount(): number } {
  const { settings } = deps;
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(settings.language, zh, en, vars);
  const skipped = new Set<string>();
  let reviewed = 0;
  let revealed = false;
  /** Whether the cloze hint of the current term is showing. */
  let hintShown = false;

  const retention = settings.review.desiredRetention;
  const dueItems = () => reviewQueue(deps.state(), Date.now(), { retention }).filter((i) => !skipped.has(i.conceptId));

  const GRADE_ACTIONS: Record<Grade, ReviewAction> = { 1: "review_again", 2: "review_hard", 3: "review_good", 4: "review_easy" };
  const gradeName = (g: Grade): string =>
    g === 1 ? L("没记住", "Again") : g === 2 ? L("勉强记得", "Hard") : g === 3 ? L("记住了", "Good") : L("很轻松", "Easy");
  /** What the reader typed for the current term, and what the model made of it. */
  let typed = "";
  type CheckOk = Extract<ResponseMap["check-answer"], { ok: true }>;
  let check: { busy: true } | { busy: false; result: CheckOk } | { busy: false; error: string } | null = null;
  /** Counts the cards shown, so a model reply that arrives after the reader moved on is dropped. */
  let cardSeq = 0;
  /** True while a grade is being saved; a second key press or click must not record it twice. */
  let saving = false;
  const resetCard = (): void => {
    cardSeq++;
    revealed = false;
    hintShown = false;
    typed = "";
    check = null;
  };

  async function answer(conceptId: string, grade: Grade): Promise<void> {
    if (saving) return;
    saving = true;
    try {
      const r = await request({ type: "review-answer", conceptId, action: GRADE_ACTIONS[grade] });
      if (!r.ok) {
        deps.setStatus(L("保存失败。", "Could not save."));
        return;
      }
      reviewed++;
      resetCard();
      await deps.reload();
    } finally {
      saving = false;
    }
  }

  async function checkAnswer(conceptId: string): Promise<void> {
    if (!typed.trim()) return;
    if (check?.busy) return;
    const seq = cardSeq;
    check = { busy: true };
    deps.draw();
    const r = await request({ type: "check-answer", conceptId, answer: typed });
    if (seq !== cardSeq) return; // the reader skipped or graded this card meanwhile
    check = r.ok
      ? { busy: false, result: r as CheckOk }
      : { busy: false, error: errorText(settings.language, "code" in r ? r.code : "internal", "retryAfterMs" in r ? r.retryAfterMs : 0) };
    deps.draw();
  }

  const nextReviewNote = (at: number): HTMLElement =>
    h(
      "span",
      { className: "next-review", "data-hb": "next-review" },
      L("下一次复习：", "Next review: "),
      dueText(at, Date.now(), settings.language),
    );

  /** The optional model check: a button that says where the answer goes, and what the model said. */
  function checkPanel(item: { conceptId: string }): HTMLElement | null {
    const route = routeCheck(settings, deps.state(), item.conceptId);
    if (route.kind === "error") {
      // Off in settings: nothing is offered. Any other failure (no model yet, sensitive source without a local one) is explained.
      if (!settings.review.modelCheck) return null;
      return h("p", { className: "check-note", "data-hb": "check-unavailable" }, errorText(settings.language, route.code));
    }
    const where = route.remote ? L("远程服务", "remote service") : L("本机", "on this computer");
    const label = L("用 {model} 检查我的回答（{where}）", "Check my answer with {model} ({where})", { model: route.model.label, where });
    const button = h(
      "button",
      { type: "button", "data-hb": "review-check", disabled: typed.trim() === "" || (check !== null && check.busy) },
      check?.busy ? L("正在检查…", "Checking…") : label,
    );
    button.addEventListener("click", () => void checkAnswer(item.conceptId));
    const result = check && !check.busy ? check : null;
    return h(
      "div",
      { className: "check", "data-hb": "check-panel" },
      button,
      h(
        "p",
        { className: "check-note", "data-hb": "check-disclosure" },
        L(
          "会把术语、你的回答和当时的解释发给 {model}（{where}）。检查本身不会保存，只保存你之后选的评分。",
          "This sends the term, your answer and its stored explanation to {model} ({where}). Nothing from the check is saved; only the grade you pick afterwards is.",
          { model: route.model.label, where },
        ),
        " ",
        h("a", { href: browser.runtime.getURL("/options.html"), "data-hb": "check-off" }, L("在设置中关闭", "Turn off in settings")),
      ),
      result && "result" in result
        ? h(
            "div",
            { className: `check-result ${result.result.verdict}`, "data-hb": "check-result" },
            h(
              "strong",
              {},
              result.result.verdict === "correct"
                ? L("基本正确", "Looks right")
                : result.result.verdict === "partial"
                  ? L("部分正确", "Partly right")
                  : L("不太对", "Not quite"),
            ),
            result.result.feedback ? ` ${result.result.feedback}` : "",
            h(
              "div",
              { className: "check-suggest" },
              L("建议评分：{grade}（由你决定）", "Suggested: {grade} (you decide)", { grade: gradeName(result.result.suggested) }),
            ),
          )
        : result
          ? h("p", { className: "check-error", role: "alert", "data-hb": "check-error" }, result.error)
          : null,
    );
  }

  /** For a term answered "Again" again and again: more repetition will not help, so point to what might. */
  const leechNote = (item: { conceptId: string; lapses: number; leech: boolean }): HTMLElement | null => {
    if (!item.leech) return null;
    return h(
      "div",
      { "data-hb": "review-leech" },
      h(
        "p",
        { className: "leech note" },
        L(
          "最近几次复习中有 {n} 次没记住，再重复可能没有帮助。",
          "You forgot this {n} times in your last few reviews; more repetition may not help.",
          { n: item.lapses },
        ),
      ),
      deps.gapsNote(item.conceptId) ??
        h(
          "a",
          { href: deps.conceptHref(item.conceptId), "data-hb": "leech-page" },
          L("看看它的页面，检查别名和关系。", "Open its page to check its aliases and relations."),
        ),
    );
  };

  function reviewView(): HTMLElement {
    const [item] = dueItems();
    if (!item) {
      return h(
        "p",
        { className: "empty", "data-hb": "review-done" },
        reviewed > 0
          ? L("今天的复习完成了，共 {n} 个。", "All done for now: {n} reviewed.", { n: reviewed })
          : L("现在没有需要复习的概念。", "Nothing to review right now."),
        ...(nextDueAt(deps.state(), retention) === null ? [] : [h("br"), nextReviewNote(nextDueAt(deps.state(), retention)!)]),
      );
    }
    const show = h("button", { type: "button", className: "primary", "data-hb": "review-show" }, L("显示解释", "Show explanation"));
    show.addEventListener("click", () => {
      revealed = true;
      deps.draw();
    });
    const button = (label: string, hb: string, onClick: () => void, cls = ""): HTMLElement => {
      const b = h("button", { type: "button", className: cls, "data-hb": hb }, label);
      b.addEventListener("click", onClick);
      return b;
    };
    const explanation = h("div", { className: "explanation", dir: "auto" });
    explanation.append(renderMarkdown(item.explanation));
    const n = deps.names(item.name, item.aliases);
    const answerBox = h("textarea", {
      className: "review-answer",
      rows: "3",
      "data-hb": "review-answer",
      placeholder: L("凭记忆写下你记得的（可选）", "Type what you remember (optional)"),
      "aria-label": L("你的回答", "Your answer"),
    });
    answerBox.value = typed;
    answerBox.addEventListener("input", () => {
      typed = answerBox.value;
      const checkButton = document.querySelector<HTMLButtonElement>('[data-hb="review-check"]');
      if (checkButton) checkButton.disabled = typed.trim() === "";
    });
    const gradable = revealed || (check !== null && !check.busy && "result" in check);
    const hintText = gradable ? null : clozeHint(item.explanation, [item.name, ...item.aliases]);
    const hint =
      hintText === null
        ? null
        : hintShown
          ? h("p", { className: "cloze", "data-hb": "review-hint-text" }, hintText)
          : button(L("提示：填空", "Show a fill-in-the-blank hint"), "review-hint-show", () => {
              hintShown = true;
              deps.draw();
            });
    const grades: Grade[] = [1, 2, 3, 4];
    return h(
      "section",
      { className: "concept review", "data-hb": "review-card" },
      h("div", { className: "concept-head" }, h("h2", { dir: "auto" }, n.name), deps.badge(item.understanding)),
      n.aliases.length > 0 ? h("div", { className: "aliases", dir: "auto" }, n.aliases.join(" · ")) : null,
      h(
        "div",
        { className: "meta" },
        deps.sourceLink(quoteTitle(item.sourceTitle, settings.language), item.sourceUrl),
        deps.timestamp(item.t),
        h("span", {}, L("还剩 {n} 个", "{n} left", { n: dueItems().length })),
        item.unlocks.length > 0
          ? h(
              "span",
              { className: "unlocks", "data-hb": "review-unlocks" },
              L("先修概念：{names} 建立在它之上", "Comes first: {names} build on it", {
                names: item.unlocks.slice(0, 3).join(", ") + (item.unlocks.length > 3 ? ` +${item.unlocks.length - 3}` : ""),
              }),
            )
          : null,
        h("span", { className: "due now", "data-hb": "review-due" }, dueText(item.dueAt, Date.now(), settings.language)),
      ),
      h(
        "div",
        { className: "actions" },
        h("p", { className: "prompt" }, L("你还记得这个概念吗？", "Do you still remember this?")),
        revealed ? null : leechNote(item),
        revealed ? null : answerBox,
        gradable ? null : hint,
        revealed ? null : show,
        revealed ? null : checkPanel(item),
      ),
      revealed
        ? h("div", {}, h("blockquote", { className: "quote", dir: "auto" }, item.selection), explanation, deps.gapsNote(item.conceptId))
        : null,
      gradable
        ? h(
            "div",
            { className: "actions" },
            ...grades.map((g) =>
              button(
                `${gradeName(g)} · ${daysText(item.previews[g], settings.language)}`,
                `review-${GRADE_ACTIONS[g].slice(7)}`,
                () => void answer(item.conceptId, g),
                g === (check && !check.busy && "result" in check ? check.result.suggested : 3) ? "primary" : "",
              ),
            ),
            button(L("跳过", "Skip"), "review-skip", () => skip(item.conceptId)),
            h(
              "p",
              { className: "prompt", "data-hb": "review-hint" },
              L(
                "按钮上是选这个评分后再次复习的间隔；跳过不改变安排。快捷键：空格显示解释，1–4 评分，S 跳过。",
                "Each button shows when the term comes back if you pick it; Skip changes nothing. Keys: Space shows the explanation, 1–4 grade, S skips.",
              ),
            ),
          )
        : null,
      !gradable && revealed === false
        ? h(
            "div",
            { className: "actions" },
            button(L("跳过", "Skip"), "review-skip", () => skip(item.conceptId)),
          )
        : null,
    );
  }

  function skip(conceptId: string): void {
    skipped.add(conceptId);
    resetCard();
    deps.draw();
  }

  /** Keyboard-only review: Space shows the explanation, 1–4 grade, S skips. Ignored while typing or on a focused control. */
  function onKey(e: KeyboardEvent): void {
    if (location.hash !== "#review" || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    const item = dueItems()[0];
    if (!item || saving || check?.busy) return;
    const gradable = revealed || (check !== null && !check.busy && "result" in check);
    if (e.key === " " && !revealed && !target?.closest("button, a")) {
      e.preventDefault();
      revealed = true;
      deps.draw();
    } else if (gradable && e.key >= "1" && e.key <= "4") {
      void answer(item.conceptId, Number(e.key) as Grade);
    } else if (e.key.toLowerCase() === "s") skip(item.conceptId);
  }

  return { view: reviewView, onKey, dueCount: () => dueItems().length };
}
