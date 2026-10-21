import type { Settings, SiteRule } from "../storage/settings";
import { h } from "../ui/dom";
import { pick } from "../ui/pick";
import { choice, input, triState } from "./form";

/** One site rule in Settings: its pattern, the three settings that may be inherited, and the model it uses. */
export function siteRow(draft: Settings, r: SiteRule, i: number, render: () => void): HTMLElement {
  const L = (zh: string, en: string) => pick(draft.language, zh, en);
  const tip = L("—：继承；勾选：开；空：关", "Dash: inherit; ticked: on; empty: off");
  const flag =
    (r: SiteRule, key: "autoScan" | "sensitive" | "disabled") =>
    (v: boolean | undefined): void => {
      if (v === undefined) delete r[key];
      else r[key] = v;
    };
  const modelSelect = h(
    "select",
    {},
    h("option", { value: "" }, L("（默认模型）", "(default model)")),
    ...draft.models.map((m) => h("option", { value: m.id, selected: r.modelId === m.id }, m.label)),
  );
  modelSelect.addEventListener("change", () => {
    if (modelSelect.value) r.modelId = modelSelect.value;
    else delete r.modelId;
  });
  const remove = h("button", { type: "button", className: "small ghost" }, L("删除", "Delete"));
  remove.addEventListener("click", () => {
    draft.sites.splice(i, 1);
    render();
  });
  return h(
    "div",
    { className: "site", "data-hb": "site-row" },
    h(
      "div",
      { className: "pattern" },
      input(r.pattern, (v) => (r.pattern = v), { "data-hb": "site-pattern", placeholder: "example.com" }),
    ),
    choice(triState(r.autoScan, flag(r, "autoScan"), tip, { "data-hb": "site-auto" }), L("自动扫描", "Auto-scan")),
    choice(triState(r.sensitive, flag(r, "sensitive"), tip, { "data-hb": "site-sensitive" }), L("敏感", "Sensitive")),
    choice(triState(r.disabled, flag(r, "disabled"), tip, { "data-hb": "site-disabled" }), L("停用", "Disabled")),
    modelSelect,
    remove,
  );
}
