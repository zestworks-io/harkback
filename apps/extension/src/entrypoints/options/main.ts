import { ulid } from "@harkback/core";
import { browser } from "wxt/browser";
import { testConnection } from "../../lib/connection";
import { h } from "../../lib/dom";
import { PRIVACY } from "../../lib/pages/privacy";
import { connectionMessage } from "../../lib/pages/setup";
import { validateSettings, withDefaults, type Settings } from "../../lib/settings";
import { hostPermissionPatterns, originPattern } from "../../lib/site-rules";

function input(value: string, onInput: (v: string) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const el = h("input", { type: "text", value, ...attrs });
  el.addEventListener("input", () => onInput(el.value));
  return el;
}

function numberInput(value: number, onInput: (v: number) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const el = h("input", { type: "number", value: String(value), ...attrs });
  el.addEventListener("input", () => onInput(Number(el.value)));
  return el;
}

function checkbox(checked: boolean, onChange: (v: boolean) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const el = h("input", { type: "checkbox", checked, ...attrs });
  el.addEventListener("change", () => onChange(el.checked));
  return el;
}

function trimmed(s: Settings): Settings {
  return {
    ...s,
    models: s.models.map((m) => ({ ...m, label: m.label.trim(), baseUrl: m.baseUrl.trim(), apiKey: m.apiKey.trim(), model: m.model.trim() })),
    sites: s.sites.map((r) => ({ ...r, pattern: r.pattern.trim() })),
  };
}

async function main(): Promise<void> {
  const draft: Settings = withDefaults((await browser.storage.local.get("settings")).settings);
  const root = document.getElementById("app")!;
  const status = h("div", { className: "result", "data-hb": "status" });
  const L = (zh: string, en: string) => (draft.language === "zh" ? zh : en);

  async function save(): Promise<void> {
    const next = trimmed(draft);
    const errors = validateSettings(next);
    if (errors.length > 0) {
      status.textContent = `${L("请检查：", "Please check: ")}${errors.join(", ")}`;
      return;
    }
    const origins = [
      ...new Set([
        ...next.models.map((m) => originPattern(m.baseUrl)).filter((p): p is string => p !== null),
        ...next.sites.filter((r) => r.autoScan && !r.disabled).flatMap((r) => hostPermissionPatterns(r.pattern)),
      ]),
    ];
    // Must be the first await: permission prompts need the click's user gesture.
    if (origins.length > 0) await browser.permissions.request({ origins }).catch(() => false);
    Object.assign(draft, next);
    await browser.storage.local.set({ settings: next });
    await browser.runtime.sendMessage({ type: "settings-changed" }).catch(() => undefined);
    status.textContent = L("已保存。", "Saved.");
  }

  function render(): void {
    const language = h("select", {}, h("option", { value: "zh", selected: draft.language === "zh" }, "中文"), h("option", { value: "en", selected: draft.language === "en" }, "English"));
    language.addEventListener("change", () => {
      draft.language = language.value === "en" ? "en" : "zh";
      render();
    });

    const modelRows = draft.models.map((m, i) => {
      const result = h("div", { className: "result" });
      const test = h("button", { type: "button" }, L("测试", "Test"));
      test.addEventListener("click", async () => {
        const pattern = originPattern(m.baseUrl.trim());
        if (pattern) await browser.permissions.request({ origins: [pattern] }).catch(() => false);
        result.textContent = connectionMessage(draft.language, await testConnection(m), location.origin);
      });
      const remove = h("button", { type: "button" }, L("删除", "Delete"));
      remove.addEventListener("click", () => {
        draft.models.splice(i, 1);
        if (draft.defaultModelId === m.id) draft.defaultModelId = null;
        if (draft.localModelId === m.id) draft.localModelId = null;
        render();
      });
      const isDefault = h("input", { type: "radio", name: "default-model", checked: draft.defaultModelId === m.id });
      isDefault.addEventListener("change", () => (draft.defaultModelId = m.id));
      const isLocal = h("input", { type: "radio", name: "local-model", checked: draft.localModelId === m.id });
      isLocal.addEventListener("change", () => (draft.localModelId = m.id));
      return h(
        "tr",
        { "data-hb": "model-row" },
        h("td", {}, input(m.label, (v) => (m.label = v))),
        h("td", {}, input(m.baseUrl, (v) => (m.baseUrl = v), { "data-hb": "model-base-url" })),
        h("td", {}, input(m.apiKey, (v) => (m.apiKey = v), { type: "password", autocomplete: "off" })),
        h("td", {}, input(m.model, (v) => (m.model = v), { "data-hb": "model-name" })),
        h("td", {}, isDefault),
        h("td", {}, isLocal),
        h("td", {}, test, " ", remove, result),
      );
    });
    const addModel = h("button", { type: "button", "data-hb": "add-model" }, L("添加模型", "Add model"));
    addModel.addEventListener("click", () => {
      draft.models.push({ id: ulid(), label: "Model", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "" });
      render();
    });

    const siteRows = draft.sites.map((r, i) => {
      const modelSelect = h("select", {}, h("option", { value: "" }, L("（默认）", "(default)")), ...draft.models.map((m) => h("option", { value: m.id, selected: r.modelId === m.id }, m.label)));
      modelSelect.addEventListener("change", () => {
        if (modelSelect.value) r.modelId = modelSelect.value;
        else delete r.modelId;
      });
      const remove = h("button", { type: "button" }, L("删除", "Delete"));
      remove.addEventListener("click", () => {
        draft.sites.splice(i, 1);
        render();
      });
      return h(
        "tr",
        { "data-hb": "site-row" },
        h("td", {}, input(r.pattern, (v) => (r.pattern = v), { "data-hb": "site-pattern", placeholder: "example.com" })),
        h("td", {}, checkbox(r.autoScan === true, (v) => (r.autoScan = v), { "data-hb": "site-auto" })),
        h("td", {}, checkbox(r.sensitive === true, (v) => (r.sensitive = v), { "data-hb": "site-sensitive" })),
        h("td", {}, checkbox(r.disabled === true, (v) => (r.disabled = v), { "data-hb": "site-disabled" })),
        h("td", {}, modelSelect),
        h("td", {}, remove),
      );
    });
    const addSite = h("button", { type: "button", "data-hb": "add-site" }, L("添加网站", "Add site"));
    addSite.addEventListener("click", () => {
      draft.sites.push({ pattern: "" });
      render();
    });

    const saveButton = h("button", { type: "button", "data-hb": "save" }, L("保存", "Save"));
    saveButton.addEventListener("click", () => void save());
    const backupNow = h("button", { type: "button", "data-hb": "backup-now" }, L("立即备份", "Back up now"));
    backupNow.addEventListener("click", async () => {
      const r = (await browser.runtime.sendMessage({ type: "backup-now" })) as { ok?: boolean; error?: string } | undefined;
      status.textContent = r?.ok ? L("已备份。", "Backed up.") : `${L("备份失败：", "Backup failed: ")}${r?.error ?? ""}`;
    });

    root.replaceChildren(
      h("h1", {}, L("Harkback 设置", "Harkback settings")),
      h("p", {}, h("a", { href: browser.runtime.getURL("/history.html") }, L("查看历史与搜索", "History and search"))),
      h("p", {}, L("解释语言：", "Explanation language: "), language),
      h("h2", {}, L("模型", "Models")),
      h(
        "table",
        {},
        h("tr", {}, ...[L("名称", "Name"), L("地址", "Address"), "API key", L("模型", "Model"), L("默认", "Default"), L("敏感来源用", "For sensitive"), ""].map((x) => h("th", {}, x))),
        ...modelRows,
      ),
      h("p", {}, addModel),
      h("p", { className: "note" }, L("非本机地址必须使用 https。API key 未加密保存在浏览器扩展存储中。敏感来源只能使用本机模型（127.0.0.1 / localhost）。", "Non-local addresses must use https. API keys are stored unencrypted in the extension's storage. Sensitive sources can only use local models (127.0.0.1 / localhost).")),
      h("h2", {}, L("网站", "Sites")),
      h(
        "table",
        {},
        h("tr", {}, ...[L("域名或网址前缀", "Domain or URL prefix"), L("自动扫描", "Auto-scan"), L("敏感", "Sensitive"), L("停用", "Disabled"), L("模型", "Model"), ""].map((x) => h("th", {}, x))),
        ...siteRows,
      ),
      h("p", {}, addSite),
      h("h2", {}, L("限制与提示", "Limits and hints")),
      h("p", {}, L("每分钟最多解释 ", "At most "), numberInput(draft.rateLimit.perMinute, (v) => (draft.rateLimit.perMinute = v), { min: "1" }), L(" 次，每小时 ", " per minute and "), numberInput(draft.rateLimit.perHour, (v) => (draft.rateLimit.perHour = v), { min: "1" }), L(" 次", " per hour")),
      h("p", {}, L("重逢间隔至少 ", "Reunions at least "), numberInput(draft.reunion.minGapDays, (v) => (draft.reunion.minGapDays = v), { min: "0" }), L(" 天，每页最多 ", " days apart, at most "), numberInput(draft.reunion.maxPerPage, (v) => (draft.reunion.maxPerPage = v), { min: "1", max: "10" }), L(" 条", " per page")),
      h("h2", {}, L("备份", "Backup")),
      h("p", {}, h("label", {}, checkbox(draft.backup.enabled, (v) => (draft.backup.enabled = v)), " ", L("每周导出 JSONL 到「下载/harkback」", "Export JSONL to Downloads/harkback every week")), " ", backupNow),
      h("h2", {}, L("隐私", "Privacy")),
      h("ul", { className: "note" }, ...PRIVACY[draft.language].map((line) => h("li", {}, line))),
      h("p", {}, saveButton),
      status,
    );
  }
  render();
}

void main();
