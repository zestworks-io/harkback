import { h } from "../dom";
import type { Digest } from "../digest";
import { pick } from "../ui/pick";
import type { Lang } from "../ui/languages";

export interface DigestViewDeps {
  digest: Digest;
  lang: Lang;
  /** Link to a concept's page. */
  conceptHref(id: string): string;
  /** True for the week that holds today, which has no later week to move to. */
  isCurrentWeek: boolean;
  /** Move to the previous (-1) or next (1) week, or back to this one (0). */
  goto(offset: -1 | 0 | 1): void;
}

const locale = (lang: Lang): string => (lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : lang);

/** "Oct 5 – Oct 11": the last day shown is the Sunday, not the Monday the range ends on. */
export function rangeText(range: { start: number; end: number }, lang: Lang): string {
  const fmt = (t: number) => new Date(t).toLocaleDateString(locale(lang), { month: "short", day: "numeric" });
  return `${fmt(range.start)} – ${fmt(range.end - 1)}`;
}

/** How this week compares with the one before, in words. */
export function comparisonText(met: number, previous: number, lang: Lang): string {
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  if (met === previous) return L("与前一周相同", "Same as the week before");
  return met > previous
    ? L("比前一周多 {n} 个", "{n} more than the week before", { n: met - previous })
    : L("比前一周少 {n} 个", "{n} fewer than the week before", { n: previous - met });
}

export function digestView({ digest: d, lang, conceptHref, isCurrentWeek, goto }: DigestViewDeps): HTMLElement {
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  const nav = (label: string, offset: -1 | 0 | 1, hb: string, disabled = false) =>
    h("button", { type: "button", className: "small-btn", "data-hb": hb, disabled, onclick: () => goto(offset) }, label);
  const tile = (label: string, value: number, note?: string) =>
    h(
      "div",
      { className: "digest-tile" },
      h("div", { className: "digest-num" }, value),
      h("div", { className: "digest-label" }, label),
      note ? h("div", { className: "digest-note" }, note) : null,
    );
  const section = (title: string, ...body: (Node | null)[]) => h("section", { className: "digest-section" }, h("h2", {}, title), ...body);
  const conceptLink = (id: string, name: string) => h("a", { href: conceptHref(id) }, name);
  const relation = (c: Digest["connections"][number]): string =>
    c.rel === "prerequisite"
      ? L("{a} 建立在 {b} 之上", "{a} builds on {b}", { a: c.from.name, b: c.to.name })
      : c.rel === "variant_of"
        ? L("{a} 是 {b} 的变体", "{a} is a variant of {b}", { a: c.from.name, b: c.to.name })
        : L("{a} 与 {b} 相关", "{a} is related to {b}", { a: c.from.name, b: c.to.name });

  const head = h(
    "div",
    { className: "digest-head" },
    h("h2", { "data-hb": "digest-range" }, rangeText(d.range, lang)),
    h(
      "div",
      { className: "digest-nav" },
      nav(L("← 上一周", "← Previous week"), -1, "digest-prev"),
      nav(L("本周", "This week"), 0, "digest-today", isCurrentWeek),
      nav(L("下一周 →", "Next week →"), 1, "digest-next", isCurrentWeek),
    ),
  );
  const note = h(
    "p",
    { className: "note" },
    L("这份周报在你的电脑上由记录生成，不会调用任何模型。", "This digest is built on this computer from your records; no model is called."),
  );
  const stillConfusedSection = (): HTMLElement =>
    section(
      L("仍然困惑", "Still confused"),
      h(
        "ul",
        { className: "digest-list", "data-hb": "digest-confused" },
        ...d.stillConfused.map((c) => h("li", {}, conceptLink(c.conceptId, c.name))),
      ),
    );
  if (d.isEmpty) {
    return h(
      "div",
      { className: "digest", "data-hb": "digest" },
      head,
      h("p", { className: "empty", "data-hb": "digest-empty" }, L("这一周没有任何记录。", "Nothing was recorded this week.")),
      d.stillConfused.length > 0 ? stillConfusedSection() : null,
      note,
    );
  }

  return h(
    "div",
    { className: "digest", "data-hb": "digest" },
    head,
    h(
      "div",
      { className: "digest-tiles" },
      tile(
        L("遇到的术语", "Terms met"),
        d.freshCount + d.revisitedCount,
        comparisonText(d.freshCount + d.revisitedCount, d.previousMet, lang),
      ),
      tile(L("新术语", "New terms"), d.freshCount),
      tile(L("重温的术语", "Revisited"), d.revisitedCount),
      tile(L("记住了", "Remembered"), d.remembered),
      tile(L("勉强记得", "Hard"), d.shaky),
      tile(L("仍然困惑", "Confused"), d.confused),
      tile(L("活跃天数", "Active days"), d.activeDays),
    ),
    d.met.length > 0
      ? section(
          L("本周遇到的术语", "Terms you met"),
          h(
            "ul",
            { className: "digest-list", "data-hb": "digest-met" },
            ...d.met.map((c) =>
              h(
                "li",
                {},
                conceptLink(c.conceptId, c.name),
                c.fresh ? h("span", { className: "digest-badge" }, L("新", "New")) : null,
                c.lookups > 1 ? h("span", { className: "digest-count" }, ` ×${c.lookups}`) : null,
              ),
            ),
          ),
        )
      : null,
    d.stillConfused.length > 0 ? stillConfusedSection() : null,
    d.sources.length > 0
      ? section(
          L("你在哪里读", "Where you read"),
          h(
            "ul",
            { className: "digest-list", "data-hb": "digest-sources" },
            ...d.sources.map((s) =>
              h("li", {}, s.title, h("span", { className: "digest-count" }, ` · ${L("{n} 次", "{n} look-ups", { n: s.lookups })}`)),
            ),
          ),
        )
      : null,
    d.connections.length > 0
      ? section(
          L("新的联系", "New connections"),
          h("ul", { className: "digest-list", "data-hb": "digest-connections" }, ...d.connections.map((c) => h("li", {}, relation(c)))),
        )
      : null,
    note,
  );
}
