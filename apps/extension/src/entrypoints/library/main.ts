import { exportMarkdown, replay, type State } from "@harkback/core";
import { browser } from "wxt/browser";
import { h } from "../../lib/dom";
import type { Request } from "../../lib/messages";
import { conceptDetail, understandingOf, type ConceptDetail, type RelatedConcept, type Understanding } from "../../lib/concept-detail";
import { localizeNames } from "../../lib/names";
import { historyModel, type HistoryConcept, type HistoryEntry } from "../../lib/history";
import { renderMarkdown } from "../../lib/markdown";
import { backupNow, request } from "../../lib/pages/request";
import { noteFiles, NOTES_FOLDER, writeNoteFiles } from "../../lib/notes";
import { reviewQueue } from "../../lib/review";
import { withDefaults } from "../../lib/settings";
import { initTheme } from "../../lib/theme";
import { pick } from "../../lib/ui/strings";
import { CHANGE_CHANNEL, EventStore } from "../../lib/store";

async function main(): Promise<void> {
  void initTheme();
  const settings = withDefaults((await browser.storage.local.get("settings")).settings);
  const L = (zh: string, en: string) => pick(settings.language, zh, en);
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

  const countLabel = (n: number) => L(`已选 ${n} 条`, `${n} selected`);
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
        del.textContent = L(`确认删除 ${n} 条`, `Confirm delete ${n}`);
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
    status.textContent = failed > 0 ? L(`${failed} 条删除失败。`, `${failed} could not be deleted.`) : "";
    if (failed === 0) selecting = false;
    if (currentConceptId() && !conceptDetail(state, currentConceptId()!)) location.hash = "";
    else draw();
  }

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
            h("div", { className: "chat-title" }, L(`追问 · ${e.followUps.length}`, `Follow-up conversation · ${e.followUps.length}`)),
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
        h("span", { className: "src" }, `《${e.sourceTitle}》`),
        h("span", {}, e.date),
        h("span", { className: `tier ${e.tier}` }, tier),
        selecting ? null : del,
      ),
      h("blockquote", { className: "quote" }, e.selection),
      body,
      chat,
    );
  };

  /** Name and other names of a concept, in the language chosen in settings. */
  const names = (canonical: string, aliases: readonly string[]) => localizeNames(canonical, aliases, settings.language);

  const conceptHref = (id: string): string => `#concept=${encodeURIComponent(id)}`;
  const badge = (u: Understanding): HTMLElement =>
    h(
      "span",
      { className: `status ${u}`, "data-hb": "understanding" },
      u === "understood" ? L("已理解", "Understood") : u === "confused" ? L("仍困惑", "Confused") : L("新", "New"),
    );

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
    return m ? decodeURIComponent(m[1]!) : null;
  }

  const onList = (): boolean => currentConceptId() === null && location.hash !== "#review";
  const skipped = new Set<string>();
  let reviewed = 0;
  let revealed = false;

  const dueItems = () => reviewQueue(state, Date.now()).filter((i) => !skipped.has(i.conceptId));

  async function answer(conceptId: string, action: "marked_understood" | "marked_confused"): Promise<void> {
    const r = await request({ type: "review-answer", conceptId, action });
    if (!r.ok) {
      status.textContent = L("保存失败。", "Could not save.");
      return;
    }
    reviewed++;
    revealed = false;
    state = replay(await store.all());
    draw();
  }

  function reviewView(): HTMLElement {
    const [item] = dueItems();
    if (!item) {
      return h(
        "p",
        { className: "empty", "data-hb": "review-done" },
        reviewed > 0
          ? L(`今天的复习完成了，共 ${reviewed} 个。`, `All done for now: ${reviewed} reviewed.`)
          : L("现在没有需要复习的概念。", "Nothing to review right now."),
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
    return h(
      "section",
      { className: "concept review", "data-hb": "review-card" },
      h("div", { className: "concept-head" }, h("h2", {}, n.name), badge(item.understanding)),
      n.aliases.length > 0 ? h("div", { className: "aliases" }, n.aliases.join(" · ")) : null,
      h(
        "div",
        { className: "meta" },
        h("span", { className: "src" }, `《${item.sourceTitle}》`),
        h("span", {}, L(`还剩 ${dueItems().length} 个`, `${dueItems().length} left`)),
      ),
      revealed
        ? h(
            "div",
            {},
            h("blockquote", { className: "quote" }, item.selection),
            explanation,
            h(
              "div",
              { className: "actions" },
              button(L("记住了", "Remembered"), "review-remembered", () => void answer(item.conceptId, "marked_understood"), "primary"),
              button(L("仍然困惑", "Still confused"), "review-confused", () => void answer(item.conceptId, "marked_confused")),
              button(L("跳过", "Skip"), "review-skip", () => {
                skipped.add(item.conceptId);
                revealed = false;
                draw();
              }),
            ),
          )
        : h(
            "div",
            { className: "actions" },
            h("p", { className: "prompt" }, L("你还记得这个概念吗？", "Do you still remember this?")),
            show,
          ),
    );
  }

  function draw(): void {
    const id = currentConceptId();
    if (location.hash === "#review") selecting = false;
    // Entries that no longer exist cannot stay selected.
    const alive = new Set(historyModel(state).flatMap((c) => c.entries.map((e) => e.encounterId)));
    for (const s of [...selected]) if (!alive.has(s)) selected.delete(s);
    visibleIds =
      id !== null
        ? (conceptDetail(state, id)?.entries.map((e) => e.encounterId) ?? [])
        : historyModel(state, search.value).flatMap((c) => c.entries.map((e) => e.encounterId));
    queueMicrotask(renderBar);
    toolbar.hidden = !onList();
    reviewLink.textContent = L(`复习 (${dueItems().length})`, `Review (${dueItems().length})`);
    if (location.hash === "#review") {
      list.replaceChildren(backLink, reviewView());
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
    if (!onList()) location.hash = "";
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
  exportMd.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([exportMarkdown(state, settings.language)], { type: "text/markdown" }));
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
        `每个概念一个 Markdown 文件，带 [[链接]]，写入所选文件夹里的 ${NOTES_FOLDER}/；同名文件会被覆盖。`,
        `One Markdown file per concept with [[links]], written to ${NOTES_FOLDER}/ in the folder you pick; files with the same name are overwritten.`,
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
      const files = noteFiles(state, settings.language);
      const { written, failed } = await writeNoteFiles(dir, files);
      status.textContent =
        failed.length === 0
          ? L(`已导出 ${written} 个笔记。`, `Exported ${written} notes.`)
          : L(
              `已导出 ${written} 个笔记，${failed.length} 个失败：${failed.slice(0, 3).join("、")}`,
              `Exported ${written} notes; ${failed.length} failed: ${failed.slice(0, 3).join(", ")}`,
            );
    } catch {
      status.textContent = L("导出失败。", "Export failed.");
    }
  });

  const reviewLink = h("a", { className: "button", href: "#review", "data-hb": "review-link" }, "");
  const toolbar = h("div", { className: "toolbar" }, search, reviewLink, selectToggle(), exportMd, exportNotes, backupButton);

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
