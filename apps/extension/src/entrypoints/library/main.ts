import { exportMarkdown, formatTimestamp, parseJsonl, replay, withoutSensitive, type State } from "@harkback/core";
import { browser } from "wxt/browser";
import { ankiTsv } from "../../lib/export/anki";
import { h } from "../../lib/ui/dom";
import { buildDigest, weekOf } from "../../lib/records/digest";
import { defaultGraphFilter, graphView } from "../../lib/pages/graph-view";
import { digestView } from "../../lib/pages/digest-view";
import { createReview } from "../../lib/pages/review-view";
import { explainImported } from "../../lib/pages/explain-imported";
import { unexplainedEncounters } from "../../lib/explain/imported";
import { commonsView } from "../../lib/pages/commons-view";
import { splitPanel } from "../../lib/pages/split-panel";
import { coalesce } from "../../lib/pages/coalesce";
import type { Request } from "../../lib/messaging/messages";
import { foundationGaps } from "../../lib/review/foundation";
import {
  conceptDetail,
  understandingOf,
  type ConceptDetail,
  type RelatedConcept,
  type SuggestedRelation,
  type Understanding,
} from "../../lib/records/concept-detail";
import { localizeNames } from "../../lib/records/names";
import { historyModel, type HistoryConcept, type HistoryEntry } from "../../lib/records/history";
import { renderMarkdown } from "../../lib/ui/markdown";
import { backupNow, request } from "../../lib/pages/request";
import { noteFiles, NOTES_FOLDER, writeNoteFiles } from "../../lib/export/notes";
import { dueText } from "../../lib/review/due";
import { dueAtOf } from "../../lib/review/review";
import { explainLanguageOf, withDefaults } from "../../lib/storage/settings";
import { sensitiveBySiteRule } from "../../lib/source/site-rules";
import { initTheme } from "../../lib/ui/theme";
import { applyLanguage, quoteTitle } from "../../lib/ui/languages";
import { pick } from "../../lib/ui/pick";
import { t, useStrings } from "../../lib/ui/strings";
import { UI_STRINGS } from "../../lib/ui/locales/ui";
import { CHANGE_CHANNEL, EventStore } from "../../lib/storage/store";

async function main(): Promise<void> {
  void initTheme();
  const settings = withDefaults((await browser.storage.local.get("settings")).settings);
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(settings.language, zh, en, vars);
  // Error messages (such as a model that could not be reached) come from the shared card text.
  applyLanguage(document.documentElement, settings.language);
  useStrings(settings.language, UI_STRINGS[settings.language] ?? {});
  const store = await EventStore.open();
  const initial = await store.all();
  let state: State = replay(initial);
  /** How many events the page last read on its own: a refresh with no new ones leaves the page as it is. */
  let readCount = initial.length;

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

  /** The source's title, opening the page it came from in a new tab when it has a web address. */
  const sourceLink = (title: string, url: string | null): HTMLElement =>
    url
      ? h("a", { className: "src", href: url, target: "_blank", rel: "noopener noreferrer", title: url }, title)
      : h("span", { className: "src" }, title);

  /** Where in a video a term was met; the link above already opens the video at that moment. */
  const timestamp = (t: number | null): HTMLElement | null =>
    t === null ? null : h("span", { className: "ts", "data-hb": "timestamp" }, formatTimestamp(t));

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
    const body = e.explanation
      ? h("div", { className: "explanation", dir: "auto" }, renderMarkdown(e.explanation))
      : h("p", { className: "note", "data-hb": "not-explained" }, t(settings.language, "highlightedInZotero"));
    const chat =
      e.followUps.length === 0
        ? null
        : h(
            "div",
            { className: "chat", "data-hb": "chat" },
            h("div", { className: "chat-title" }, L("追问 · {n}", "Follow-up conversation · {n}", { n: e.followUps.length })),
            ...e.followUps.flatMap((f) => {
              const answer = h("div", { className: "explanation chat-a", dir: "auto", "data-hb": "chat-answer" });
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
        sourceLink(quoteTitle(e.sourceTitle, settings.language), e.sourceUrl),
        timestamp(e.t),
        h("span", {}, e.date),
        !e.explanation
          ? null
          : e.evidenceUrl
            ? h(
                "a",
                {
                  className: `tier ${e.tier}`,
                  href: e.evidenceUrl,
                  target: "_blank",
                  rel: "noopener",
                  title: L("在原页面上查看引用的段落", "See the quoted passage on the page"),
                  "data-hb": "evidence-link",
                },
                tier,
              )
            : h("span", { className: `tier ${e.tier}` }, tier),
        e.sensitive ? sensitiveBadge(e.sourceId) : null,
        selecting ? null : del,
      ),
      h("blockquote", { className: "quote", dir: "auto" }, e.selection),
      e.note
        ? h(
            "p",
            { className: "reader-note", dir: "auto", "data-hb": "entry-note" },
            h("strong", {}, L("我的笔记：", "Your note: ")),
            e.note,
          )
        : null,
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
        h("h2", { dir: "auto" }, h("a", { href: conceptHref(c.conceptId) }, n.name)),
        badge(understandingOf(state, c.conceptId)),
        dueBadge(c.conceptId),
      ),
      n.aliases.length > 0 ? h("div", { className: "aliases", dir: "auto" }, n.aliases.join(" · ")) : null,
      h("ul", { className: "entries" }, ...c.entries.map(entryView)),
    );
  };

  /** Sends a correction, then re-reads the records and draws again. */
  async function correct(
    req: Extract<Request, { type: "merge-concepts" | "add-alias" | "resolve-alias" | "reject-edge" | "confirm-edge" | "set-muted" }>,
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

  /** `suggestion`: the kind of a weak relation, shown before the name, with a button to confirm it. */
  const chip = (r: RelatedConcept, suggestion?: string): HTMLElement => {
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
    const confirm = suggestion
      ? h(
          "button",
          {
            type: "button",
            className: "chip-x chip-ok",
            title: L("确认这个关系", "Confirm this relation"),
            "aria-label": L("确认这个关系", "Confirm this relation"),
            "data-hb": "confirm-edge",
          },
          "✓",
        )
      : null;
    confirm?.addEventListener("click", () => void correct({ type: "confirm-edge", edgeId: r.edgeId }));
    return h("span", { className: `chip${r.studied ? "" : " muted"}` }, suggestion ? `${suggestion} ` : "", link, confirm, remove);
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
        merge.textContent = L("确认合并", "Confirm merge");
        return;
      }
      void correct({ type: "merge-concepts", fromId: d.conceptId, intoId: into }, () => {
        const next = conceptHref(state.representative.get(into) ?? into);
        if (location.hash === next) draw();
        else location.hash = next; // hashchange redraws
      });
    });

    const splitHost = h("div", { "data-hb": "split-host" });
    const splitToggle = h("button", { type: "button", className: "small-btn", "data-hb": "split" }, L("拆分…", "Split…"));
    splitToggle.addEventListener("click", () => {
      if (splitHost.firstChild) return void splitHost.replaceChildren();
      splitHost.replaceChildren(
        splitPanel({
          detail: d,
          lang: settings.language,
          split: (req) => request(req),
          done: (conceptId) => {
            void (async () => {
              state = replay(await store.all());
              const next = conceptHref(state.representative.get(conceptId) ?? conceptId);
              if (location.hash === next) draw();
              else location.hash = next; // hashchange redraws
            })();
          },
        }),
      );
    });

    return h(
      "div",
      {},
      h("div", { className: "edit-tools", "data-hb": "edit-tools" }, muteButton, alias, addAlias, target, datalist, merge, splitToggle),
      splitHost,
    );
  };

  /** Names the model suggested, such as a translation. They match nothing on pages until accepted. */
  const suggestedNames = (d: ConceptDetail): HTMLElement | null => {
    if (d.suggestedNames.length === 0) return null;
    const one = (alias: string): HTMLElement => {
      const buttons: HTMLButtonElement[] = [];
      // One decision per name: a second click while the first is being saved would find nothing left to decide.
      const decide = (accept: boolean) => () => {
        buttons.forEach((b) => (b.disabled = true));
        void correct({ type: "resolve-alias", conceptId: d.conceptId, alias, accept }).then(() =>
          buttons.forEach((b) => (b.disabled = false)),
        );
      };
      const accept = h(
        "button",
        { type: "button", className: "small-btn", title: L("采用这个名字", "Use this name"), "data-hb": "alias-accept" },
        L("采用", "Accept"),
      );
      const reject = h(
        "button",
        { type: "button", className: "small-btn", title: L("不再建议这个名字", "Stop suggesting this name"), "data-hb": "alias-reject" },
        L("拒绝", "Reject"),
      );
      buttons.push(accept, reject);
      accept.addEventListener("click", decide(true));
      reject.addEventListener("click", decide(false));
      return h(
        "span",
        { className: "chip", "data-hb": "suggested-name" },
        h("span", { "data-hb": "suggested-alias" }, alias),
        accept,
        reject,
      );
    };
    return h(
      "div",
      { className: "group", "data-hb": "suggested-names" },
      h("h3", {}, L("建议的名称", "Suggested names")),
      h(
        "p",
        { className: "note" },
        L("采用后，页面上的这个名字才会被识别。", "A suggested name is only recognised on pages once you accept it."),
      ),
      h("div", { className: "chips" }, ...d.suggestedNames.map(one)),
    );
  };

  const relatedGroup = (title: string, items: RelatedConcept[]): HTMLElement | null =>
    items.length === 0
      ? null
      : h("div", { className: "group" }, h("h3", {}, title), h("div", { className: "chips" }, ...items.map((r) => chip(r))));

  const suggestedRelations = (d: ConceptDetail): HTMLElement | null => {
    if (d.suggested.length === 0) return null;
    const kind = (rel: SuggestedRelation["rel"]): string =>
      rel === "prerequisite" ? L("前置：", "Prerequisite:") : rel === "variant_of" ? L("变体：", "Variant:") : L("相关：", "Related:");
    return h(
      "div",
      { className: "group", "data-hb": "suggested-relations" },
      h("h3", {}, L("可能的关系", "Possible relations")),
      h(
        "p",
        { className: "note" },
        L(
          "模型不太确定这些关系。确认后它们会用于复习顺序、重逢提示和图谱。",
          "The model was unsure about these. Once confirmed, they are used for the review order, reunion hints and the graph.",
        ),
      ),
      h("div", { className: "chips" }, ...d.suggested.map((r) => chip(r, kind(r.rel)))),
    );
  };

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
        h("h2", { dir: "auto" }, n.name),
        badge(d.understanding),
        dueBadge(d.conceptId),
        h("span", { className: "domain" }, d.domain),
        h("span", { className: "spacer" }),
        selectToggle(),
      ),
      n.aliases.length > 0 ? h("div", { className: "aliases", dir: "auto" }, n.aliases.join(" · ")) : null,
      d.muted
        ? h(
            "p",
            { className: "note", "data-hb": "muted-note" },
            L("已静音：不会出现重逢提示，也不会进入复习。", "Muted: no reunion hints and no review."),
          )
        : null,
      gapsNote(d.conceptId),
      editTools(d),
      suggestedNames(d),
      relatedGroup(L("前置概念", "Prerequisites"), d.prerequisites),
      relatedGroup(L("变体", "Variants"), d.variants),
      relatedGroup(L("相关", "Related"), d.related),
      suggestedRelations(d),
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

  /** Pages of their own, apart from the list and the concept pages. */
  const VIEWS: readonly string[] = ["#review", "#graph", "#digest", "#commons"];
  const onList = (): boolean => currentConceptId() === null && !VIEWS.includes(location.hash);
  const imported = explainImported({
    lang: () => settings.language,
    pending: () => unexplainedEncounters(state),
    explain: (encounterId) => request({ type: "explain-imported", encounterId }),
    reload: () => refresh(),
    draw: () => draw(),
  });

  const review = createReview({
    state: () => state,
    settings,
    reload: async () => {
      state = replay(await store.all());
      draw();
    },
    draw: () => draw(),
    setStatus: (text) => (status.textContent = text),
    names,
    badge,
    sourceLink,
    timestamp,
    gapsNote,
    conceptHref,
  });
  document.addEventListener("keydown", (e) => review.onKey(e));

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

  /** The paper picked on the contribute page; it survives the page being drawn again when records change. */
  let commonsPaper: string | null = null;
  const commonsPage = (): HTMLElement =>
    commonsView({
      state,
      lang: settings.language,
      alsoSensitive: (s) => sensitiveBySiteRule(settings.sites, s),
      paper: commonsPaper,
      onPick: (paper) => (commonsPaper = paper),
      save: async (scope, contribution) => {
        const r = await request({ type: "record-consent", scope: scope.scope, target: scope.target }).catch(() => ({ ok: false }));
        if (!r.ok) {
          status.textContent = L("保存失败。", "Could not save.");
          return;
        }
        download(
          `${JSON.stringify(contribution, null, 2)}\n`,
          "application/json",
          `harkback-commons-${new Date().toISOString().slice(0, 7)}.json`,
        );
        state = replay(await store.all());
        draw();
      },
    });

  const graphFilter = defaultGraphFilter();
  /** The size the map was last laid out for. */
  let graphSize = "";

  function draw(): void {
    const id = currentConceptId();
    if (VIEWS.includes(location.hash)) selecting = false;
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
    reviewLink.textContent = L("复习 ({n})", "Review ({n})", { n: review.dueCount() });
    if (location.hash === "#review") {
      list.replaceChildren(backLink, review.view());
      return;
    }
    if (location.hash === "#graph") {
      graphSize = `${list.clientWidth}x${window.innerHeight}`;
      list.replaceChildren(
        backLink,
        graphView({
          state,
          lang: settings.language,
          query: search.value,
          width: list.clientWidth,
          filter: graphFilter,
          nameOf: (id) => {
            const c = state.concepts.get(id)!;
            return names(c.canonicalName, c.names).name;
          },
          conceptHref,
          redraw: (focus) => {
            draw();
            list.querySelector<HTMLElement>(`[data-hb="${focus}"]`)?.focus();
          },
        }),
      );
      return;
    }
    if (location.hash === "#digest") {
      list.replaceChildren(backLink, digestPage());
      return;
    }
    if (location.hash === "#commons") {
      list.replaceChildren(backLink, commonsPage());
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
      ...[imported.view()].filter((el): el is HTMLElement => el !== null),
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
  // The map is laid out for the size it is shown at: a window made another size lays it out again.
  let resizing: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => {
      if (location.hash === "#graph" && `${list.clientWidth}x${window.innerHeight}` !== graphSize) draw();
    }, 250);
  });
  // Explanations are recorded on other tabs while this one stays open. A burst of them is read about once a second.
  // Focus comes back often with nothing new: then the page is left alone, so a panned graph or a half-typed answer stays.
  const refresh = coalesce(async () => {
    const events = await store.all();
    if (events.length === readCount) return;
    readCount = events.length;
    state = replay(events);
    draw();
  }, 1000);
  const refreshQuietly = (): void => void refresh().catch(() => undefined);
  document.addEventListener("visibilitychange", () => document.hidden || refreshQuietly());
  window.addEventListener("focus", refreshQuietly);
  new BroadcastChannel(CHANGE_CHANNEL).addEventListener("message", refreshQuietly);

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
              names: failed.slice(0, 3).join(settings.language === "zh" ? "、" : settings.language === "ar" ? "، " : ", "),
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
  const commonsLink = h(
    "a",
    {
      className: "button",
      href: "#commons",
      "data-hb": "commons-link",
      title: L(
        "把开放许可论文里的查词整理成匿名文件，贡献给数据公地。",
        "Turn your look-ups in openly licensed papers into an anonymous file for the data commons.",
      ),
    },
    L("贡献", "Contribute"),
  );
  const toolbar = h(
    "div",
    { className: "toolbar" },
    search,
    reviewLink,
    graphLink,
    digestLink,
    commonsLink,
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
