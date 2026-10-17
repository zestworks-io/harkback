import {
  buildContribution,
  isContributable,
  type AlsoSensitive,
  type Contribution,
  type ContributionScope,
  type State,
} from "@harkback/core";
import { h } from "../ui/dom";
import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";

export interface CommonsViewDeps {
  state: State;
  lang: Lang;
  /** Sources the reader's site rules make sensitive. */
  alsoSensitive: AlsoSensitive;
  /** The paper picked before the page was drawn again, or null for every paper. */
  paper: string | null;
  onPick(paper: string | null): void;
  /** Records the reader's consent for the scope, then saves the file. */
  save(scope: ContributionScope, contribution: Contribution): void;
}

const ALL: ContributionScope = { scope: "all_public_sources", target: null };

/** The papers that may be contributed, by title. */
export function contributablePapers(state: State, alsoSensitive: AlsoSensitive): { sourceId: string; title: string }[] {
  const ids = new Set([...state.encounters.values()].map((e) => e.sourceId));
  return [...ids]
    .filter((id) => isContributable(state, id, alsoSensitive))
    .map((id) => ({ sourceId: id, title: state.sources.get(id)?.title || id }))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}

/**
 * Prepares a contribution to the data commons: the reader picks what to include, sees every line of the file, and saves it.
 * Nothing is sent anywhere.
 */
export function commonsView({ state, lang, alsoSensitive, paper, onPick, save }: CommonsViewDeps): HTMLElement {
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  const papers = contributablePapers(state, alsoSensitive);
  // A paper that can no longer be contributed falls back to every paper.
  let scope: ContributionScope = paper && papers.some((p) => p.sourceId === paper) ? { scope: "this_source", target: paper } : ALL;

  const select = h(
    "select",
    { "data-hb": "commons-scope", "aria-label": L("贡献范围", "What to contribute") },
    h("option", { value: "" }, L("所有开放许可的论文", "Every openly licensed paper")),
    ...papers.map((p) => h("option", { value: p.sourceId, dir: "auto" }, p.title)),
  );
  select.value = scope.target ?? "";
  const summary = h("p", { className: "note", "data-hb": "commons-summary" });
  const preview = h("pre", { className: "commons-preview", "data-hb": "commons-preview", dir: "ltr" });
  const saveButton = h("button", { type: "button", "data-hb": "commons-save" }, L("保存贡献文件", "Save contribution file"));

  let contribution = buildContribution(state, scope, alsoSensitive);
  const show = (): void => {
    contribution = buildContribution(state, scope, alsoSensitive);
    const paperCount = new Set(contribution.records.map((r) => r.paper)).size;
    summary.textContent = L(
      "{n} 次查词，来自 {p} 篇论文；{r} 个你确认过的关系。",
      "{n} look-ups from {p} papers; {r} relations you confirmed.",
      {
        n: contribution.records.length,
        p: paperCount,
        r: contribution.relations.length,
      },
    );
    preview.textContent = JSON.stringify(contribution, null, 2);
    saveButton.disabled = contribution.records.length === 0;
  };
  select.addEventListener("change", () => {
    scope = select.value ? { scope: "this_source", target: select.value } : ALL;
    onPick(scope.target);
    show();
  });
  saveButton.addEventListener("click", () => save(scope, contribution));
  show();

  const last = state.consents.at(-1);
  return h(
    "section",
    { className: "commons", "data-hb": "commons" },
    h("h2", {}, L("贡献给数据公地", "Contribute to the data commons")),
    h(
      "p",
      {},
      L(
        "数据公地收集读者在论文里卡住的概念，供作者、教师和其他读者使用。只有开放许可（CC 或公有领域）的 arXiv 或 DOI 论文可以贡献，敏感来源永远不会包含在内。",
        "The data commons collects the terms readers get stuck on in papers, for authors, teachers and other readers. Only arXiv or DOI papers with an open licence (Creative Commons or public domain) can be contributed, and sensitive sources never are.",
      ),
    ),
    h(
      "p",
      {},
      L(
        "文件里有：论文编号、许可、术语、领域、章节、你的理解程度和月份，以及你确认过的关系。没有原文、解释、网址、设备或确切时间。",
        "The file holds the paper's id, its licence, the term, its field and section, how well you understood it and the month, and the relations you confirmed. It has no quotes, explanations, addresses, device or exact times.",
      ),
    ),
    h(
      "p",
      { className: "note" },
      L(
        "Harkback 不会上传任何东西：你保存文件，自己决定是否提交以及提交到哪里。保存时会记下你同意贡献的范围。",
        "Harkback uploads nothing: you save the file and decide yourself whether and where to submit it. Saving records what you agreed to contribute.",
      ),
    ),
    papers.length === 0
      ? h(
          "p",
          { className: "empty", "data-hb": "commons-empty" },
          L(
            "还没有可以贡献的论文。Harkback 只在页面写明开放许可时记下它，例如 arXiv 摘要页上的许可链接。",
            "No paper can be contributed yet. Harkback only knows a licence when the page states it, such as the licence link on an arXiv abstract page.",
          ),
        )
      : h("div", { className: "commons-tools" }, select, saveButton),
    summary,
    preview,
    last
      ? h(
          "p",
          { className: "note", "data-hb": "commons-last" },
          L("上次保存：{date}", "Last saved: {date}", {
            date: new Date(last.at).toLocaleDateString(`${lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : lang}-u-nu-latn`),
          }),
        )
      : null,
  );
}
