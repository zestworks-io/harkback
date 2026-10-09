import { DAY_MS, exportMarkdown, parseJsonl, replay, withoutSensitive, type Grade, type ReviewAction, type State } from "@harkback/core";
import { DOMAINS, type Domain } from "@harkback/spec";
import { browser } from "wxt/browser";
import { ankiTsv } from "../../lib/anki";
import { h } from "../../lib/dom";
import { buildDigest, weekOf } from "../../lib/digest";
import { buildGraph } from "../../lib/graph";
import { digestView } from "../../lib/pages/digest-view";
import type { Request, ResponseMap } from "../../lib/messages";
import { foundationGaps } from "../../lib/foundation";
import { conceptDetail, understandingOf, type ConceptDetail, type RelatedConcept, type Understanding } from "../../lib/concept-detail";
import { localizeNames } from "../../lib/names";
import { historyModel, type HistoryConcept, type HistoryEntry } from "../../lib/history";
import { renderMarkdown } from "../../lib/markdown";
import { backupNow, request } from "../../lib/pages/request";
import { noteFiles, NOTES_FOLDER, writeNoteFiles } from "../../lib/notes";
import { dueText, daysText } from "../../lib/due";
import { dueAtOf, nextDueAt, reviewQueue } from "../../lib/review";
import { routeCheck } from "../../lib/review-check";
import { explainLanguageOf, withDefaults } from "../../lib/settings";
import { sensitiveBySiteRule } from "../../lib/site-rules";
import { initTheme } from "../../lib/theme";
import { quoteTitle } from "../../lib/ui/languages";
import { pick } from "../../lib/ui/pick";
import { errorText, useStrings } from "../../lib/ui/strings";
import { UI_STRINGS } from "../../lib/ui/locales/ui";
import { CHANGE_CHANNEL, EventStore } from "../../lib/store";

async function main(): Promise<void> {
  void initTheme();
  const settings = withDefaults((await browser.storage.local.get("settings")).settings);
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(settings.language, zh, en, vars);
  // Error messages (such as a model that could not be reached) come from the shared card text.
  useStrings(settings.language, UI_STRINGS[settings.language] ?? {});
  const store = await EventStore.open();
  let state: State = replay(await store.all());

  const root = document.getElementById("app")!;
  const list = h("div", { "data-hb": "history" });
  const status = h("div", { className: "result", "data-hb": "status" });
  const search = h("input", {
    type: "search",
    "data-hb": "search",
    placeholder: L("搜索概念、原文或解释", "Search concepts, quotes or explanations"),
  });

  // Multi-select: `selecting` shows checkboxes; `visibleIds` are the entries on screen, which "Select all" covers.
  let selecting = false;
  const selected = new Set<string>();
  let visibleIds: string[] = [];

  const checkbox = (id: string, onChange: (checked: boolean) => void, hb: string, label: string): HTMLInputElement => {
    const box = h("input", { type: "checkbox", className: "pick", "data-hb": hb, "data-id": id, "aria-label": label });
    box.checked = selected.has(id);
    box.addEventListener("change", () => onChange(box.checked));
    return box;
  };

  /** Entry ids of one concept, for its "select all" box. */
  const idsOf = (el: Element): string[] => (el.getAttribute("data-ids") ?? "").split(",").filter(Boolean);

  const selectToggle = (): HTMLButtonElement => {
    const b = h("button", { type: "button", "data-hb": "select-mode" }, "");
    b.addEventListener("click", () => {
      selecting = !selecting;
      selected.clear();
      draw();
    });
    return b;
  };

  const countLabel = (n: number) => L("已选 {n} 条", "{n} selected", { n });
  const bar = h("div", { className: "selbar", "data-hb": "selection-bar", hidden: true });

  /** Brings checkboxes, highlights and the bar in step with `selected` without redrawing the list. */
  function syncSelection(): void {
    for (const box of list.querySelectorAll<HTMLInputElement>('input[data-hb="select-entry"]')) {
      box.checked = selected.has(box.dataset.id ?? "");
      box.closest(".entry")?.classList.toggle("selected", box.checked);
    }
    for (const box of list.querySelectorAll<HTMLInputElement>('input[data-hb="select-concept"]')) {
      const ids = idsOf(box);
      const n = ids.filter((id) => selected.has(id)).length;
      box.checked = n > 0 && n === ids.length;
      box.indeterminate = n > 0 && n < ids.length;
    }
    renderBar();
  }

  function renderBar(): void {
    bar.hidden = !selecting;
    for (const b of document.querySelectorAll<HTMLElement>('[data-hb="select-mode"]'))
      b.textContent = selecting ? L("完成", "Done") : L("选择", "Select");
    if (!selecting) return bar.replaceChildren();
    const n = selected.size;
    const all = h("button", { type: "button", "data-hb": "select-all" }, L("全选", "Select all"));
    all.addEventListener("click", () => {
      for (const id of visibleIds) selected.add(id);
      syncSelection();
    });
    const none = h("button", { type: "button", "data-hb": "select-none", disabled: n === 0 }, L("清除", "Clear"));
    none.addEventListener("click", () => {
      selected.clear();
      syncSelection();
    });
    const del = h("button", { type: "button", className: "danger", "data-hb": "delete-selected", disabled: n === 0 }, L("删除", "Delete"));
    del.addEventListener("click", async () => {
      if (del.dataset.confirm !== "1") {
        del.dataset.confirm = "1";
        del.textContent = L("确认删除 {n} 条", "Confirm delete {n}", { n });
        return;
      }
      del.disabled = true;
      await deleteSelected();
    });
    bar.replaceChildren(h("span", { className: "count", "data-hb": "selection-count" }, countLabel(n)), all, none, del);
  }

  async function deleteSelected(): Promise<void> {
    const ids = [...selected];
    let failed = 0;
    for (const encounterId of ids) {
      const r = await request({ type: "delete-encounter", encounterId }).catch(() => ({ ok: false }));
      if (r.ok) selected.delete(encounterId);
      else failed++;
    }
    state = replay(await store.all());
    status.textContent = failed > 0 ? L("{failed} 条删除失败。", "{failed} could not be deleted.", { failed }) : "";
    if (failed === 0) selecting = false;
    if (currentConceptId() && !conceptDetail(state, currentConceptId()!)) location.hash = "";
    else draw();
  }

  /** A sensitive source's content stays on this computer; the reader can lift that for a source they marked by mistake. */
  const sensitiveBadge = (sourceId: string): HTMLElement => {
    const undo = h("button", { type: "button", className: "small", "data-hb": "mark-normal" }, L("改为普通来源", "Mark as normal"));
    undo.addEventListener("click", async () => {
      if (undo.dataset.confirm !== "1") {
        undo.dataset.confirm = "1";
        undo.textContent = L("确认：之后可发送给远程模型", "Confirm: may go to remote models");
        return;
      }
      const r = await request({ type: "mark-normal", sourceId });
      if (r.ok) {
        state = replay(await store.all());
        draw();
      } else status.textContent = L("操作失败。", "That did not work.");
    });
    return h(
      "span",
      {
        className: "sensitive-badge",
        "data-hb": "sensitive-badge",
        title: L("这个来源的内容只会发给本机模型。", "Content from this source only goes to a local model."),
      },
      L("敏感来源", "Sensitive source"),
      undo,
    );
  };

  const entryView = (e: HistoryEntry): HTMLElement => {
    const del = h("button", { type: "button", className: "small", "data-hb": "delete" }, L("删除", "Delete"));
    del.addEventListener("click", async () => {
      if (del.dataset.confirm !== "1") {
        del.dataset.confirm = "1";
        del.textContent = L("确认删除", "Confirm delete");
        return;
      }
      const r = await request({ type: "delete-encounter", encounterId: e.encounterId });
      if (r.ok) {
        state = replay(await store.all());
        if (currentConceptId() && !conceptDetail(state, currentConceptId()!)) location.hash = "";
        else draw();
      } else {
        status.textContent = L("删除失败。", "Delete failed.");
      }
    });
    const tier = e.tier === "defined_in_source" ? L("原文定义", "Defined in source") : L("外部知识", "External knowledge");
    const body = h("div", { className: "explanation" });
    body.append(renderMarkdown(e.explanation));
    const chat =
      e.followUps.length === 0
        ? null
        : h(
            "div",
            { className: "chat", "data-hb": "chat" },
            h("div", { className: "chat-title" }, L("追问 · {n}", "Follow-up conversation · {n}", { n: e.followUps.length })),
            ...e.followUps.flatMap((f) => {
              const answer = h("div", { className: "explanation chat-a", "data-hb": "chat-answer" });
              answer.append(renderMarkdown(f.answer));
              return [h("div", { className: "chat-q", "data-hb": "chat-question" }, f.question), answer];
            }),
          );
    const choose = selecting
      ? checkbox(
          e.encounterId,
          (on) => {
            if (on) selected.add(e.encounterId);
            else selected.delete(e.encounterId);
            syncSelection();
          },
          "select-entry",
          L("选择这条记录", "Select this entry"),
        )
      : null;
    return h(
      "li",
      { className: `entry${selecting && selected.has(e.encounterId) ? " selected" : ""}`, "data-hb": "entry" },
      h(
        "div",
        { className: "meta" },
        choose,
        h("span", { className: "src" }, quoteTitle(e.sourceTitle, settings.language)),
        h("span", {}, e.date),
        h("span", { className: `tier ${e.tier}` }, tier),
        e.sensitive ? sensitiveBadge(e.sourceId) : null,
        selecting ? null : del,
      ),
      h("blockquote", { className: "quote" }, e.selection),
      body,
      chat,
    );
  };

  /** Name and other names of a concept, in the language chosen in settings. */
  const names = (canonical: string, aliases: readonly string[]) => localizeNames(canonical, aliases, explainLanguageOf(settings));

  const conceptHref = (id: string): string => `#concept=${encodeURIComponent(id)}`;
  const badge = (u: Understanding): HTMLElement =>
    h(
      "span",
      { className: `status ${u}`, "data-hb": "understanding" },
      u === "understood"
        ? L("已理解", "Understood")
        : u === "shaky"
          ? L("不太牢", "Shaky")
          : u === "confused"
            ? L("仍困惑", "Confused")
            : L("新", "New"),
    );

  /** When the concept is next up for review; nothing for muted concepts. */
  const dueBadge = (conceptId: string): HTMLElement | null => {
    const at = dueAtOf(state, conceptId, settings.review.desiredRetention);
    if (at === null) return null;
    const now = Date.now();
    return h(
      "span",
      {
        className: `due${at <= now ? " now" : ""}`,
        "data-hb": "due",
        title: L(
          "新术语查词一天后进入复习；之后根据你每次的评分，在你快要忘记时安排下一次。",
          "A new term is due a day after you look it up; after that the next review is set for when you are about to forget it, based on how each answer went.",
        ),
      },
      dueText(at, now, settings.language),
    );
  };

  /** Selects or clears every entry of one concept. */
  const conceptPick = (ids: string[]): HTMLElement | null => {
    if (!selecting) return null;
    const box = h("input", {
      type: "checkbox",
      className: "pick",
      "data-hb": "select-concept",
      "data-ids": ids.join(","),
      "aria-label": L("选择这个概念的全部记录", "Select all entries of this concept"),
    });
    const n = ids.filter((id) => selected.has(id)).length;
    box.checked = n > 0 && n === ids.length;
    box.indeterminate = n > 0 && n < ids.length;
    box.addEventListener("change", () => {
      for (const id of ids) {
        if (box.checked) selected.add(id);
        else selected.delete(id);
      }
      syncSelection();
    });
    return box;
  };

  const conceptView = (c: HistoryConcept): HTMLElement => {
    const n = names(c.name, c.aliases);
    return h(
      "section",
      { className: "concept", "data-hb": "concept" },
      h(
        "div",
        { className: "concept-head" },
        conceptPick(c.entries.map((e) => e.encounterId)),
        h("h2", {}, h("a", { href: conceptHref(c.conceptId) }, n.name)),
        badge(understandingOf(state, c.conceptId)),
        dueBadge(c.conceptId),
      ),
      n.aliases.length > 0 ? h("div", { className: "aliases" }, n.aliases.join(" · ")) : null,
      h("ul", { className: "entries" }, ...c.entries.map(entryView)),
    );
  };

  /** Sends a correction, then re-reads the records and draws again. */
  async function correct(
    req: Extract<Request, { type: "merge-concepts" | "add-alias" | "reject-edge" | "set-muted" }>,
    afterRefresh?: () => void,
  ): Promise<void> {
    const r = await request(req);
    if (!r.ok) {
      status.textContent =
        "collides" in r && r.collides
          ? L("这个名字属于另一个概念，请用“合并”。", "That name belongs to another concept; use Merge instead.")
          : L("操作失败。", "That did not work.");
      return;
    }
    status.textContent = "";
    state = replay(await store.all());
    if (afterRefresh) afterRefresh();
    else draw();
  }

  const chip = (r: RelatedConcept): HTMLElement => {
    const label = names(r.name, r.aliases).name;
    const link = r.studied
      ? h("a", { href: conceptHref(r.conceptId), "data-hb": "related" }, label)
      : h("span", { title: L("还没解释过", "Not explained yet"), "data-hb": "related" }, label);
    const remove = h(
      "button",
      {
        type: "button",
        className: "chip-x",
        title: L("移除这个关系", "Remove this relation"),
        "aria-label": L("移除这个关系", "Remove this relation"),
        "data-hb": "reject-edge",
      },
      "×",
    );
    remove.addEventListener("click", () => void correct({ type: "reject-edge", edgeId: r.edgeId }));
    return h("span", { className: `chip${r.studied ? "" : " muted"}` }, link, remove);
  };

  const editTools = (d: ConceptDetail): HTMLElement => {
    const muteButton = h(
      "button",
      { type: "button", className: "small-btn", "data-hb": "mute" },
      d.muted ? L("取消静音", "Unmute") : L("静音", "Mute"),
    );
    muteButton.addEventListener("click", () => void correct({ type: "set-muted", conceptId: d.conceptId, muted: !d.muted }));

    const alias = h("input", { type: "text", placeholder: L("添加别名", "Add an alias"), "data-hb": "alias-input", maxlength: "80" });
    const addAlias = h("button", { type: "button", className: "small-btn", "data-hb": "alias-add" }, L("添加", "Add"));
    const submitAlias = () => {
      if (alias.value.trim()) void correct({ type: "add-alias", conceptId: d.conceptId, alias: alias.value });
    };
    addAlias.addEventListener("click", submitAlias);
    alias.addEventListener("keydown", (e) => e.key === "Enter" && submitAlias());

    // A searchable list: type part of a name and pick it. Equal names get a number so each choice is unique.
    const choices = new Map<string, string>();
    for (const c of historyModel(state).filter((c) => c.conceptId !== d.conceptId)) {
      const shown = names(c.name, c.aliases).name;
      let label = shown;
      for (let n = 2; choices.has(label); n++) label = `${shown} (${n})`;
      choices.set(label, c.conceptId);
    }
    const listId = `merge-choices-${d.conceptId}`;
    const target = h("input", {
      type: "text",
      list: listId,
      placeholder: L("合并到…", "Merge into…"),
      "data-hb": "merge-target",
      autocomplete: "off",
    });
    const datalist = h("datalist", { id: listId }, ...[...choices.keys()].map((label) => h("option", { value: label })));
    const merge = h("button", { type: "button", className: "small-btn", "data-hb": "merge", disabled: true }, L("合并", "Merge"));
    target.addEventListener("input", () => {
      merge.disabled = !choices.has(target.value);
      merge.textContent = L("合并", "Merge");
      delete merge.dataset.confirm;
    });
    merge.addEventListener("click", () => {
      const into = choices.get(target.value);
      if (!into) return;
      if (merge.dataset.confirm !== "1") {
        merge.dataset.confirm = "1";
        merge.textContent = L("确认合并（不可撤销）", "Confirm merge (cannot be undone)");
        return;
      }
      void correct({ type: "merge-concepts", fromId: d.conceptId, intoId: into }, () => {
        const next = conceptHref(state.representative.get(into) ?? into);
        if (location.hash === next) draw();
        else location.hash = next; // hashchange redraws
      });
    });

    return h("div", { className: "edit-tools", "data-hb": "edit-tools" }, muteButton, alias, addAlias, target, datalist, merge);
  };

  const relatedGroup = (title: string, items: RelatedConcept[]): HTMLElement | null =>
    items.length === 0 ? null : h("div", { className: "group" }, h("h3", {}, title), h("div", { className: "chips" }, ...items.map(chip)));

  /** For a term you are struggling with: the prerequisites that may be what is missing. */
  const gapsNote = (conceptId: string): HTMLElement | null => {
    const all = foundationGaps(state, conceptId);
    if (all.length === 0) return null;
    const gaps = all.slice(0, 3);
    const reasonText = (r: (typeof gaps)[number]["reason"]): string =>
      r === "confused" ? L("仍困惑", "Confused") : r === "shaky" ? L("不太牢", "Shaky") : L("还没解释过", "Not explained yet");
    return h(
      "div",
      { className: "gaps note", "data-hb": "foundation-gaps" },
      h("strong", {}, L("先补这些可能更有效：", "It may help to start with:")),
      " ",
      ...gaps.flatMap((g, i) => [
        i > 0 ? ", " : "",
        g.reason === "unstudied"
          ? h("span", { "data-hb": "gap" }, names(g.name, g.aliases).name)
          : h("a", { href: conceptHref(g.conceptId), "data-hb": "gap" }, names(g.name, g.aliases).name),
        ` (${reasonText(g.reason)})`,
      ]),
      all.length > gaps.length ? ` +${all.length - gaps.length}` : "",
    );
  };

  const detailView = (d: ConceptDetail): HTMLElement => {
    const n = names(d.name, d.aliases);
    return h(
      "section",
      { className: "concept detail", "data-hb": "concept-detail" },
      h(
        "div",
        { className: "concept-head" },
        conceptPick(d.entries.map((e) => e.encounterId)),
        h("h2", {}, n.name),
        badge(d.understanding),
        dueBadge(d.conceptId),
        h("span", { className: "domain" }, d.domain),
        h("span", { className: "spacer" }),
        selectToggle(),
      ),
      n.aliases.length > 0 ? h("div", { className: "aliases" }, n.aliases.join(" · ")) : null,
      d.muted
        ? h(
            "p",
            { className: "note", "data-hb": "muted-note" },
            L("已静音：不会出现重逢提示，也不会进入复习。", "Muted: no reunion hints and no review."),
          )
        : null,
      gapsNote(d.conceptId),
      editTools(d),
      relatedGroup(L("前置概念", "Prerequisites"), d.prerequisites),
      relatedGroup(L("变体", "Variants"), d.variants),
      relatedGroup(L("相关", "Related"), d.related),
      h("ul", { className: "entries" }, ...d.entries.map(entryView)),
    );
  };

  const backLink = h("a", { className: "back", href: "#", "data-hb": "back" }, L("← 所有概念", "← All concepts"));

  function currentConceptId(): string | null {
    const m = /^#concept=(.+)$/.exec(location.hash);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]!);
    } catch {
      return null; // a hash that is not valid text names no concept
    }
  }

  const onList = (): boolean =>
    currentConceptId() === null && location.hash !== "#review" && location.hash !== "#graph" && location.hash !== "#digest";
  const skipped = new Set<string>();
  let reviewed = 0;
  let revealed = false;

  const retention = settings.review.desiredRetention;
  const dueItems = () => reviewQueue(state, Date.now(), { retention }).filter((i) => !skipped.has(i.conceptId));

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
    typed = "";
    check = null;
  };

  async function answer(conceptId: string, grade: Grade): Promise<void> {
    if (saving) return;
    saving = true;
    try {
      const r = await request({ type: "review-answer", conceptId, action: GRADE_ACTIONS[grade] });
      if (!r.ok) {
        status.textContent = L("保存失败。", "Could not save.");
        return;
      }
      reviewed++;
      resetCard();
      state = replay(await store.all());
      draw();
    } finally {
      saving = false;
    }
  }

  async function checkAnswer(conceptId: string): Promise<void> {
    if (!typed.trim()) return;
    if (check?.busy) return;
    const seq = cardSeq;
    check = { busy: true };
    draw();
    const r = await request({ type: "check-answer", conceptId, answer: typed });
    if (seq !== cardSeq) return; // the reader skipped or graded this card meanwhile
    check = r.ok
      ? { busy: false, result: r as CheckOk }
      : { busy: false, error: errorText(settings.language, "code" in r ? r.code : "internal", "retryAfterMs" in r ? r.retryAfterMs : 0) };
    draw();
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
    const route = routeCheck(settings, state, item.conceptId);
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

  function reviewView(): HTMLElement {
    const [item] = dueItems();
    if (!item) {
      return h(
        "p",
        { className: "empty", "data-hb": "review-done" },
        reviewed > 0
          ? L("今天的复习完成了，共 {n} 个。", "All done for now: {n} reviewed.", { n: reviewed })
          : L("现在没有需要复习的概念。", "Nothing to review right now."),
        ...(nextDueAt(state, retention) === null ? [] : [h("br"), nextReviewNote(nextDueAt(state, retention)!)]),
      );
    }
    const show = h("button", { type: "button", className: "primary", "data-hb": "review-show" }, L("显示解释", "Show explanation"));
    show.addEventListener("click", () => {
      revealed = true;
      draw();
    });
    const button = (label: string, hb: string, onClick: () => void, cls = ""): HTMLElement => {
      const b = h("button", { type: "button", className: cls, "data-hb": hb }, label);
      b.addEventListener("click", onClick);
      return b;
    };
    const explanation = h("div", { className: "explanation" });
    explanation.append(renderMarkdown(item.explanation));
    const n = names(item.name, item.aliases);
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
      const checkButton = list.querySelector<HTMLButtonElement>('[data-hb="review-check"]');
      if (checkButton) checkButton.disabled = typed.trim() === "";
    });
    const gradable = revealed || (check !== null && !check.busy && "result" in check);
    const grades: Grade[] = [1, 2, 3, 4];
    return h(
      "section",
      { className: "concept review", "data-hb": "review-card" },
      h("div", { className: "concept-head" }, h("h2", {}, n.name), badge(item.understanding)),
      n.aliases.length > 0 ? h("div", { className: "aliases" }, n.aliases.join(" · ")) : null,
      h(
        "div",
        { className: "meta" },
        h("span", { className: "src" }, quoteTitle(item.sourceTitle, settings.language)),
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
        revealed ? null : answerBox,
        revealed ? null : show,
        revealed ? null : checkPanel(item),
      ),
      revealed ? h("div", {}, h("blockquote", { className: "quote" }, item.selection), explanation, gapsNote(item.conceptId)) : null,
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
    draw();
  }

  /** Keyboard-only review: Space shows the explanation, 1–4 grade, S skips. Ignored while typing or on a focused control. */
  document.addEventListener("keydown", (e) => {
    if (location.hash !== "#review" || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    const item = dueItems()[0];
    if (!item || saving || check?.busy) return;
    const gradable = revealed || (check !== null && !check.busy && "result" in check);
    if (e.key === " " && !revealed && !target?.closest("button, a")) {
      e.preventDefault();
      revealed = true;
      draw();
    } else if (gradable && e.key >= "1" && e.key <= "4") {
      void answer(item.conceptId, Number(e.key) as Grade);
    } else if (e.key.toLowerCase() === "s") skip(item.conceptId);
  });

  const SVG = "http://www.w3.org/2000/svg";
  const svgEl = (tag: string, attrs: Record<string, string | number> = {}, ...children: Node[]): SVGElement => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    el.append(...children);
    return el;
  };

  /** Which week the digest shows: 0 is this week, -1 the one before. Never in the future. */
  let digestOffset = 0;
  const digestPage = (): HTMLElement =>
    digestView({
      digest: buildDigest(state, weekOf(Date.now(), digestOffset)),
      lang: settings.language,
      conceptHref,
      isCurrentWeek: digestOffset >= 0,
      goto: (move) => {
        digestOffset = move === 0 ? 0 : Math.min(0, digestOffset + move);
        draw();
      },
    });

  const graphFilter: { domain: "" | Domain; understanding: "" | Understanding; days: number } = { domain: "", understanding: "", days: 0 };

  /** A drop-down that redraws the map when it changes and keeps the keyboard where it was. */
  function graphSelect(name: string, label: string, options: [string, string][], value: string, set: (v: string) => void): HTMLElement {
    const select = h(
      "select",
      { "data-hb": `graph-filter-${name}`, "aria-label": label },
      ...options.map(([v, text]) => h("option", { value: v }, text)),
    );
    select.value = value;
    select.addEventListener("change", () => {
      set(select.value);
      draw();
      list.querySelector<HTMLElement>(`[data-hb="graph-filter-${name}"]`)?.focus();
    });
    return h("label", {}, label, " ", select);
  }

  function graphFilterBar(): HTMLElement {
    return h(
      "div",
      { className: "graph-filters", "data-hb": "graph-filters" },
      graphSelect(
        "domain",
        L("领域", "Field"),
        [["", L("全部领域", "All fields")], ...DOMAINS.map((d): [string, string] => [d, d])],
        graphFilter.domain,
        (v) => (graphFilter.domain = v as "" | Domain),
      ),
      graphSelect(
        "understanding",
        L("理解程度", "Understanding"),
        [
          ["", L("全部", "All levels")],
          ["understood", L("已理解", "Understood")],
          ["shaky", L("不太牢", "Shaky")],
          ["confused", L("仍困惑", "Confused")],
          ["new", L("新", "New")],
        ],
        graphFilter.understanding,
        (v) => (graphFilter.understanding = v as "" | Understanding),
      ),
      graphSelect(
        "days",
        L("最近查过", "Looked up"),
        [
          ["0", L("任何时间", "Any time")],
          ["7", L("最近 7 天", "Last 7 days")],
          ["30", L("最近 30 天", "Last 30 days")],
          ["90", L("最近 90 天", "Last 90 days")],
        ],
        String(graphFilter.days),
        (v) => (graphFilter.days = Number(v)),
      ),
    );
  }

  /** The concepts as a map: relations as lines, colour by how well each is understood. Drag to move, wheel to zoom. */
  function graphView(): HTMLElement {
    const filtered = graphFilter.domain !== "" || graphFilter.understanding !== "" || graphFilter.days > 0;
    const g = buildGraph(state, {
      query: search.value,
      ...(graphFilter.domain && { domain: graphFilter.domain }),
      ...(graphFilter.understanding && { understanding: graphFilter.understanding }),
      ...(graphFilter.days > 0 && { since: Date.now() - graphFilter.days * DAY_MS }),
      width: 960,
      height: 640,
    });
    if (g.nodes.length === 0) {
      return h(
        "div",
        {},
        graphFilterBar(),
        h(
          "p",
          { className: "empty", "data-hb": "graph-empty" },
          filtered
            ? L("没有符合这些筛选条件的概念。", "No concepts match these filters.")
            : L("还没有可显示的概念。", "No concepts to show yet."),
        ),
      );
    }
    const view = { x: 0, y: 0, w: g.width, h: g.height };
    const svg = svgEl("svg", { class: "graph", viewBox: `0 0 ${g.width} ${g.height}`, role: "group", "data-hb": "graph" });
    svg.setAttribute("aria-label", L("概念关系图", "Concept graph"));
    const marker = (rel: string) =>
      svgEl(
        "marker",
        {
          id: `arrow-${rel}`,
          class: rel,
          viewBox: "0 0 10 10",
          refX: 17,
          refY: 5,
          markerWidth: 7,
          markerHeight: 7,
          orient: "auto-start-reverse",
        },
        svgEl("path", { d: "M0 0 L10 5 L0 10 z" }),
      );
    svg.append(svgEl("defs", {}, marker("prerequisite"), marker("variant_of")));
    const at = new Map(g.nodes.map((n) => [n.id, n]));
    for (const e of g.edges) {
      const a = at.get(e.from)!;
      const b = at.get(e.to)!;
      svg.append(
        svgEl("line", {
          class: `edge ${e.rel}`,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          ...(e.rel === "related" ? {} : { "marker-end": `url(#arrow-${e.rel})` }),
        }),
      );
    }
    for (const n of g.nodes) {
      const name = names(n.name, state.concepts.get(n.id)?.names.filter((x) => x !== n.name) ?? []).name;
      const node = svgEl(
        "a",
        {
          href: n.studied ? conceptHref(n.id) : "#graph",
          class: `node ${n.studied ? n.understanding : "unstudied"}`,
          "data-hb": "graph-node",
          "data-id": n.id,
        },
        svgEl("circle", { cx: n.x, cy: n.y, r: 6 + Math.min(n.degree, 6) * 1.5 }),
        svgEl("text", { x: n.x, y: n.y - 12 - Math.min(n.degree, 6) * 1.5 }, document.createTextNode(name)),
      );
      node.append(svgEl("title", {}, document.createTextNode(n.studied ? name : `${name} — ${L("还没解释过", "Not explained yet")}`)));
      svg.append(node);
    }
    const apply = () => svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    svg.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        const rect = svg.getBoundingClientRect();
        const factor = ev.deltaY < 0 ? 0.85 : 1 / 0.85;
        const w = Math.min(g.width * 4, Math.max(g.width / 8, view.w * factor));
        const k = w / view.w;
        const px = view.x + ((ev.clientX - rect.left) / rect.width) * view.w;
        const py = view.y + ((ev.clientY - rect.top) / rect.height) * view.h;
        view.x = px - (px - view.x) * k;
        view.y = py - (py - view.y) * k;
        view.w = w;
        view.h = view.h * k;
        apply();
      },
      { passive: false },
    );
    let drag: { x: number; y: number } | null = null;
    svg.addEventListener("pointerdown", (ev) => {
      if ((ev.target as Element).closest("a")) return;
      drag = { x: ev.clientX, y: ev.clientY };
      svg.classList.add("dragging");
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const rect = svg.getBoundingClientRect();
      view.x -= ((ev.clientX - drag.x) / rect.width) * view.w;
      view.y -= ((ev.clientY - drag.y) / rect.height) * view.h;
      drag = { x: ev.clientX, y: ev.clientY };
      apply();
    });
    const end = () => {
      drag = null;
      svg.classList.remove("dragging");
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    return h(
      "div",
      {},
      graphFilterBar(),
      h(
        "div",
        { className: "graph-wrap" },
        svg,
        h(
          "div",
          { className: "legend", "data-hb": "graph-legend" },
          L("蓝线箭头：前置概念 · 紫线箭头：变体 · 虚线：相关", "Blue arrow: prerequisite · Purple arrow: variant · Dashed: related"),
          L(
            "实心绿：已理解 · 浅黄：不太牢 · 黄：仍困惑 · 蓝：新 · 虚线圈：还没解释过",
            "Green: understood · Pale yellow: shaky · Yellow: confused · Blue: new · Dashed ring: not explained yet",
          ),
        ),
      ),
    );
  }

  function draw(): void {
    const id = currentConceptId();
    if (location.hash === "#review" || location.hash === "#graph" || location.hash === "#digest") selecting = false;
    // Entries that no longer exist cannot stay selected.
    const alive = new Set(historyModel(state).flatMap((c) => c.entries.map((e) => e.encounterId)));
    for (const s of [...selected]) if (!alive.has(s)) selected.delete(s);
    visibleIds =
      id !== null
        ? (conceptDetail(state, id)?.entries.map((e) => e.encounterId) ?? [])
        : historyModel(state, search.value).flatMap((c) => c.entries.map((e) => e.encounterId));
    queueMicrotask(renderBar);
    toolbar.hidden = !onList() && location.hash !== "#graph" && location.hash !== "#digest";
    for (const el of toolbar.querySelectorAll<HTMLElement>("[data-list-only]")) el.hidden = !onList();
    reviewLink.textContent = L("复习 ({n})", "Review ({n})", { n: dueItems().length });
    if (location.hash === "#review") {
      list.replaceChildren(backLink, reviewView());
      return;
    }
    if (location.hash === "#graph") {
      list.replaceChildren(backLink, graphView());
      return;
    }
    if (location.hash === "#digest") {
      list.replaceChildren(backLink, digestPage());
      return;
    }
    if (id !== null) {
      const d = conceptDetail(state, id);
      list.replaceChildren(
        backLink,
        d ? detailView(d) : h("p", { className: "empty", "data-hb": "not-found" }, L("没有找到这个概念。", "Concept not found.")),
      );
      return;
    }
    const model = historyModel(state, search.value);
    list.replaceChildren(
      ...(model.length > 0
        ? model.map(conceptView)
        : [
            h(
              "p",
              { className: "empty", "data-hb": "empty" },
              L("没有找到记录。选中一个词并解释后，它会出现在这里。", "No records found. Explain a term and it will show up here."),
            ),
          ]),
    );
  }
  search.addEventListener("input", () => {
    if (!onList() && location.hash !== "#graph") location.hash = "";
    else draw();
  });
  window.addEventListener("hashchange", draw);
  // Explanations are recorded on other tabs while this one stays open.
  const refresh = async (): Promise<void> => {
    state = replay(await store.all());
    draw();
  };
  document.addEventListener("visibilitychange", () => document.hidden || void refresh());
  window.addEventListener("focus", () => void refresh());
  new BroadcastChannel(CHANGE_CHANNEL).addEventListener("message", () => void refresh());

  const backupButton = h("button", { type: "button", "data-hb": "backup-now" }, L("立即备份 JSONL", "Back up JSONL now"));
  backupButton.addEventListener("click", async () => {
    status.textContent = L("正在备份…", "Backing up…");
    status.textContent = await backupNow(settings.language);
  });

  const exportMd = h("button", { type: "button", "data-hb": "export-md" }, L("导出 Markdown", "Export Markdown"));
  /** The records to export: without sensitive sources when the settings say so. */
  const exportState = async (): Promise<State> =>
    settings.backup.excludeSensitive ? replay(withoutSensitive(await store.all(), (s) => sensitiveBySiteRule(settings.sites, s))) : state;
  const download = (text: string, type: string, filename: string): void => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h("a", { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const exportAnki = h(
    "button",
    {
      type: "button",
      "data-hb": "export-anki",
      title: L(
        "每个概念一张卡片（制表符分隔的文本），可在 Anki 里用“导入”打开。",
        "One card per concept as tab-separated text; open it in Anki with File → Import.",
      ),
    },
    L("导出 Anki 卡片", "Export Anki cards"),
  );
  exportAnki.addEventListener("click", async () => {
    download(ankiTsv(await exportState()), "text/tab-separated-values", `harkback-anki-${new Date().toISOString().slice(0, 10)}.txt`);
  });

  const fileInput = h("input", { type: "file", accept: ".jsonl,.json,.txt,application/x-ndjson", hidden: true, "data-hb": "import-file" });
  const importButton = h(
    "button",
    {
      type: "button",
      "data-hb": "import",
      title: L(
        "从 JSONL 备份恢复记录。已有的记录会被跳过，不会重复。",
        "Restore records from a JSONL backup. Records you already have are skipped, so nothing is duplicated.",
      ),
    },
    L("导入 JSONL", "Import JSONL"),
  );
  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    status.textContent = L("正在导入…", "Importing…");
    try {
      const parsed = parseJsonl(await file.text());
      const total = parsed.events.length;
      const r = total > 0 ? await request({ type: "import-events", events: parsed.events }) : { ok: true as const, added: 0 };
      if (!r.ok) {
        status.textContent = L("导入失败。", "Import failed.");
        return;
      }
      state = replay(await store.all());
      draw();
      status.textContent = L(
        "已导入 {added} 条新记录，跳过 {skipped} 条已有或无法读取的记录。",
        "Imported {added} new events; skipped {skipped} that were already here or could not be read.",
        {
          added: "added" in r ? (r.added ?? 0) : 0,
          skipped: total - ("added" in r ? (r.added ?? 0) : 0) + parsed.skipped.length + parsed.future.length,
        },
      );
    } catch {
      status.textContent = L("导入失败。", "Import failed.");
    }
  });

  exportMd.addEventListener("click", async () => {
    const url = URL.createObjectURL(new Blob([exportMarkdown(await exportState(), settings.language)], { type: "text/markdown" }));
    const a = h("a", { href: url, download: `harkback-${new Date().toISOString().slice(0, 10)}.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  const exportNotes = h(
    "button",
    {
      type: "button",
      "data-hb": "export-notes",
      title: L(
        "每个概念一个 Markdown 文件，带 [[链接]]，写入所选文件夹里的 {folder}/；再次导出会更新笔记，你写在标记行下面的内容会保留。",
        "One Markdown file per concept with [[links]], written to {folder}/ in the folder you pick. Exporting again updates the notes and keeps anything you wrote below the marker line.",
        { folder: NOTES_FOLDER },
      ),
    },
    L("导出笔记文件夹", "Export notes folder"),
  );
  exportNotes.addEventListener("click", async () => {
    const picker = (window as unknown as { showDirectoryPicker?: (o: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker;
    if (!picker) {
      status.textContent = L("这个浏览器不支持选择文件夹。", "This browser cannot pick a folder.");
      return;
    }
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await picker.call(window, { mode: "readwrite" });
    } catch {
      return; // cancelled
    }
    try {
      const files = noteFiles(await exportState(), settings.language);
      const { written, failed } = await writeNoteFiles(dir, files);
      status.textContent =
        failed.length === 0
          ? L("已导出 {n} 个笔记。", "Exported {n} notes.", { n: written })
          : L("已导出 {n} 个笔记，{failed} 个失败：{names}", "Exported {n} notes; {failed} failed: {names}", {
              n: written,
              failed: failed.length,
              names: failed.slice(0, 3).join(settings.language === "zh" ? "、" : ", "),
            });
    } catch {
      status.textContent = L("导出失败。", "Export failed.");
    }
  });

  const reviewLink = h(
    "a",
    {
      className: "button",
      href: "#review",
      "data-hb": "review-link",
      title: L(
        "到期的术语。新术语查词一天后到期；之后根据你每次的评分，在你快要忘记时再来。",
        "Terms that are due. A new term is due a day after you look it up; after that each answer sets when it comes back, just before you would forget it.",
      ),
    },
    "",
  );
  const graphLink = h(
    "a",
    {
      className: "button",
      href: "#graph",
      "data-hb": "graph-link",
      title: L("把概念和它们的关系画成一张图。", "Draw your concepts and their relations as a map."),
    },
    L("关系图", "Graph"),
  );
  const digestLink = h(
    "a",
    {
      className: "button",
      href: "#digest",
      "data-hb": "digest-link",
      title: L(
        "这一周遇到了什么：由你的记录在本机生成，不调用模型。",
        "What you met this week, built on this computer from your records; no model is called.",
      ),
    },
    L("周报", "Digest"),
  );
  const toolbar = h(
    "div",
    { className: "toolbar" },
    search,
    reviewLink,
    graphLink,
    digestLink,
    ...[selectToggle(), exportMd, exportAnki, exportNotes, backupButton, importButton].map(
      (b) => (b.setAttribute("data-list-only", ""), b),
    ),
    fileInput,
  );

  root.replaceChildren(
    h(
      "div",
      { className: "page-head" },
      h(
        "div",
        {},
        h("h1", {}, L("历史", "History")),
        h("p", { className: "sub" }, L("你解释过的每个词，按概念整理。", "Every term you have looked up, grouped by concept.")),
      ),
      h("a", { href: browser.runtime.getURL("/options.html") }, L("设置", "Settings")),
    ),
    toolbar,
    status,
    list,
    bar,
    h(
      "p",
      { className: "note" },
      L(
        "删除在应用层生效；磁盘上可能仍有残留，已导出的备份无法追回。",
        "Deletion takes effect in the app; traces may remain on disk, and exported backups cannot be recalled.",
      ),
    ),
  );
  draw();
}

void main();
