import { exportMarkdown, replay, type State } from "@harkback/core";
import { browser } from "wxt/browser";
import { h } from "../../lib/dom";
import { historyModel, type HistoryConcept, type HistoryEntry } from "../../lib/history";
import { renderMarkdown } from "../../lib/markdown";
import { backupNow, request } from "../../lib/pages/request";
import { withDefaults } from "../../lib/settings";
import { pick } from "../../lib/ui/strings";
import { CHANGE_CHANNEL, EventStore } from "../../lib/store";

async function main(): Promise<void> {
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

  const entryView = (e: HistoryEntry): HTMLElement => {
    const del = h("button", { type: "button", "data-hb": "delete" }, L("删除", "Delete"));
    del.addEventListener("click", async () => {
      if (del.dataset.confirm !== "1") {
        del.dataset.confirm = "1";
        del.textContent = L("确认删除", "Confirm delete");
        return;
      }
      const r = await request({ type: "delete-encounter", encounterId: e.encounterId });
      if (r.ok) {
        state = replay(await store.all());
        draw();
      } else {
        status.textContent = L("删除失败。", "Delete failed.");
      }
    });
    const tier = e.tier === "defined_in_source" ? L("原文定义", "Defined in source") : L("外部知识", "External knowledge");
    const body = h("div");
    body.append(renderMarkdown(e.explanation));
    return h(
      "li",
      { "data-hb": "entry" },
      h("div", { className: "meta" }, `${e.date} · 《${e.sourceTitle}》 · ${tier} · 「${e.selection}」 `, del),
      body,
    );
  };

  const conceptView = (c: HistoryConcept): HTMLElement =>
    h(
      "section",
      { "data-hb": "concept" },
      h("h2", {}, c.name),
      c.aliases.length > 0 ? h("div", { className: "aliases" }, c.aliases.join(" · ")) : null,
      h("ul", {}, ...c.entries.map(entryView)),
    );

  function draw(): void {
    const model = historyModel(state, search.value);
    list.replaceChildren(
      ...(model.length > 0 ? model.map(conceptView) : [h("p", { "data-hb": "empty" }, L("没有找到记录。", "No records found."))]),
    );
  }
  search.addEventListener("input", draw);
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

  root.replaceChildren(
    h("h1", {}, L("Harkback · 历史", "Harkback · History")),
    h(
      "p",
      {},
      search,
      " ",
      backupButton,
      " ",
      exportMd,
      " ",
      h("a", { href: browser.runtime.getURL("/options.html") }, L("设置", "Settings")),
    ),
    status,
    list,
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
