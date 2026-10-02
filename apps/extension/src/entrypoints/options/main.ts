import { EXPLAIN_LANGUAGES, ulid } from "@harkback/core";
import { browser } from "wxt/browser";
import { testConnection } from "../../lib/connection";
import { h } from "../../lib/dom";
import { privacyNotes } from "../../lib/pages/privacy";
import { backupNow, request, requestOrigins } from "../../lib/pages/request";
import { connectionMessage } from "../../lib/pages/setup";
import { validateSettings, withDefaults, type Settings, type SiteRule } from "../../lib/settings";
import { applyTheme } from "../../lib/theme";
import { PROVIDERS, providerById } from "../../lib/providers";
import { hostPermissionPatterns, originPattern } from "../../lib/site-rules";
import { secretInput } from "../../lib/ui/secret-input";
import { isLang, UI_LANGUAGES } from "../../lib/ui/languages";
import { pick } from "../../lib/ui/pick";

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

/** A checkbox with a third state: left alone (inherits from a broader rule), on, or explicitly off. */
function triState(
  value: boolean | undefined,
  onChange: (v: boolean | undefined) => void,
  title: string,
  attrs: Record<string, unknown> = {},
) {
  let current = value;
  const el = h("input", { type: "checkbox", title, ...attrs });
  const paint = () => {
    el.indeterminate = current === undefined;
    el.checked = current === true;
  };
  paint();
  el.addEventListener("click", () => {
    current = current === undefined ? true : current === true ? false : undefined;
    onChange(current);
    paint();
  });
  return el;
}

function trimmed(s: Settings): Settings {
  return {
    ...s,
    models: s.models.map((m) => ({
      ...m,
      label: m.label.trim(),
      baseUrl: m.baseUrl.trim(),
      apiKey: m.apiKey.trim(),
      model: m.model.trim(),
    })),
    sites: s.sites.map((r) => ({ ...r, pattern: r.pattern.trim() })),
  };
}

async function main(): Promise<void> {
  const draft: Settings = withDefaults((await browser.storage.local.get("settings")).settings);
  applyTheme(draft.theme);
  const root = document.getElementById("app")!;
  const status = h("div", { className: "result", "data-hb": "status" });
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(draft.language, zh, en, vars);

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
    if (origins.length > 0) await requestOrigins(origins);
    Object.assign(draft, next);
    await browser.storage.local.set({ settings: next });
    await request({ type: "settings-changed" });
    status.textContent = L("已保存。", "Saved.");
  }

  function render(): void {
    const language = h(
      "select",
      { "aria-label": L("界面语言", "Interface language") },
      ...UI_LANGUAGES.map((l) => h("option", { value: l.code, selected: draft.language === l.code }, l.native)),
    );
    language.addEventListener("change", () => {
      if (isLang(language.value)) draft.language = language.value;
      render();
    });

    const explainLanguage = h(
      "select",
      { "data-hb": "explain-language", "aria-label": L("解释语言", "Explanation language") },
      h("option", { value: "auto", selected: draft.explainLanguage === "auto" }, L("跟随界面语言", "Same as the interface")),
      ...EXPLAIN_LANGUAGES.map((l) => h("option", { value: l.code, selected: draft.explainLanguage === l.code }, l.native)),
    );
    explainLanguage.addEventListener("change", () => (draft.explainLanguage = explainLanguage.value));

    const theme = h(
      "select",
      { "aria-label": L("外观", "Appearance") },
      h("option", { value: "system", selected: draft.theme === "system" }, L("跟随系统", "System")),
      h("option", { value: "light", selected: draft.theme === "light" }, L("浅色", "Light")),
      h("option", { value: "dark", selected: draft.theme === "dark" }, L("深色", "Dark")),
    );
    theme.addEventListener("change", () => {
      draft.theme = theme.value === "light" || theme.value === "dark" ? theme.value : "system";
      applyTheme(draft.theme);
    });

    const field = (label: string, control: HTMLElement, cls = "") =>
      h("label", { className: `field ${cls}`.trim() }, h("span", {}, label), control);
    const choice = (control: HTMLElement, label: string) => h("label", { className: "choice" }, control, label);
    const card = (title: string, desc: string | null, body: (Node | null)[], foot: Node[] = []) =>
      h(
        "section",
        { className: "card" },
        h("div", { className: "card-head" }, h("h2", {}, title), desc ? h("p", {}, desc) : null),
        h("div", { className: "card-body" }, ...body),
        foot.length > 0 ? h("div", { className: "card-foot" }, ...foot) : null,
      );

    const modelRows = draft.models.map((m, i) => {
      const provider = h(
        "select",
        { "data-hb": "model-provider", "aria-label": L("服务", "Provider") },
        ...PROVIDERS.map((p) =>
          h("option", { value: p.id, selected: m.provider === p.id }, p.id === "custom" ? L("自定义", "Custom") : p.label),
        ),
      );
      provider.addEventListener("change", () => {
        const p = providerById(provider.value);
        const previous = providerById(m.provider);
        m.provider = p.id;
        // "Custom" keeps whatever address was typed; the others fill in theirs.
        if (p.baseUrl) {
          m.baseUrl = p.baseUrl;
          if (!m.label.trim() || m.label === "Model" || m.label === previous.label) m.label = p.label;
        }
        render();
      });
      const preset = providerById(m.provider);
      const result = h("div", { className: "result", "data-hb": "model-result" });
      const test = h("button", { type: "button", className: "small", "data-hb": "model-test" }, L("测试连接", "Test connection"));
      test.addEventListener("click", async () => {
        const pattern = originPattern(m.baseUrl.trim());
        if (pattern) await requestOrigins([pattern]);
        result.textContent = connectionMessage(draft.language, await testConnection(m), location.origin);
      });
      const remove = h("button", { type: "button", className: "small ghost" }, L("删除", "Delete"));
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
        "div",
        { className: "item", "data-hb": "model-row" },
        h(
          "div",
          { className: "grid" },
          field(L("服务", "Provider"), provider),
          field(
            L("名称", "Name"),
            input(m.label, (v) => (m.label = v)),
          ),
          field(
            L("模型", "Model"),
            input(m.model, (v) => (m.model = v), { "data-hb": "model-name", placeholder: preset.modelHint || "gpt-4o-mini" }),
          ),
          field(
            L("地址", "Address"),
            input(m.baseUrl, (v) => (m.baseUrl = v), { "data-hb": "model-base-url" }),
            "wide",
          ),
          field(
            "API key",
            secretInput(
              input(m.apiKey, (v) => (m.apiKey = v), { type: "password", autocomplete: "off" }),
              {
                show: L("显示", "Show"),
                hide: L("隐藏", "Hide"),
              },
            ),
            "wide",
          ),
        ),
        h(
          "div",
          { className: "item-foot" },
          choice(isDefault, L("默认模型", "Default")),
          choice(isLocal, L("敏感来源用", "For sensitive sources")),
          h("span", { className: "spacer" }),
          test,
          remove,
        ),
        result,
      );
    });
    const addModel = h("button", { type: "button", className: "add", "data-hb": "add-model" }, L("+ 添加模型", "+ Add model"));
    addModel.addEventListener("click", () => {
      draft.models.push({ id: ulid(), label: "Model", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "", provider: "ollama" });
      render();
    });

    const tip = L("—：继承；勾选：开；空：关", "Dash: inherit; ticked: on; empty: off");
    const flag =
      (r: SiteRule, key: "autoScan" | "sensitive" | "disabled") =>
      (v: boolean | undefined): void => {
        if (v === undefined) delete r[key];
        else r[key] = v;
      };
    const siteRows = draft.sites.map((r, i) => {
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
    });
    const addSite = h("button", { type: "button", className: "add", "data-hb": "add-site" }, L("+ 添加网站", "+ Add site"));
    addSite.addEventListener("click", () => {
      draft.sites.push({ pattern: "" });
      render();
    });

    const saveButton = h("button", { type: "button", className: "primary", "data-hb": "save" }, L("保存", "Save changes"));
    saveButton.addEventListener("click", () => void save());
    const backupButton = h("button", { type: "button", className: "small", "data-hb": "backup-now" }, L("立即备份", "Back up now"));
    backupButton.addEventListener("click", async () => {
      status.textContent = await backupNow(draft.language);
    });

    root.replaceChildren(
      h(
        "div",
        { className: "page-head" },
        h(
          "div",
          {},
          h("h1", {}, L("Harkback 设置", "Harkback settings")),
          h("p", { className: "sub" }, L("模型、网站与隐私。", "Models, sites and privacy.")),
        ),
        h(
          "div",
          { className: "head-tools" },
          h("a", { href: browser.runtime.getURL("/library.html") }, L("历史与搜索", "History and search")),
          theme,
          language,
        ),
      ),
      card(
        L("解释语言", "Explanation language"),
        L(
          "解释和追问的回答用这种语言书写；术语保持原文。模型的回答质量因语言而异。",
          "Explanations and follow-up answers are written in this language; technical terms stay in their original form. Quality varies by language and model.",
        ),
        [explainLanguage],
      ),
      card(
        L("模型", "Models"),
        L(
          "纯 http 只允许用于本机（127.0.0.1 / localhost）和你自己网络里的服务器（192.168.x.x、10.x.x.x、name.local、Tailscale）；其他地址必须使用 https。自己网络里的服务器仍算远程。勾选「敏感来源用」的本机模型（127.0.0.1 / localhost）会用于敏感来源；敏感来源不会使用其他模型。",
          'Plain http is only allowed for this computer (127.0.0.1 / localhost) and for servers on your own network (192.168.x.x, 10.x.x.x, name.local, Tailscale); every other address must use https. A server on your own network still counts as remote. A local model (127.0.0.1 / localhost) ticked "For sensitive sources" is the one used for sensitive sources; they never use any other model.',
        ),
        [
          ...modelRows,
          addModel,
          h(
            "p",
            { className: "note" },
            L(
              "API key 未加密保存在浏览器扩展存储中：其他网站和扩展读不到，但能读取本机磁盘的人可以。它只会发送到你填写的模型地址，不会写入备份或日志。建议使用有额度限制的 key，或使用本机模型（无需 key）。",
              "API keys are stored unencrypted in the extension's storage: other sites and extensions cannot read them, but anyone with access to this computer's disk can. A key is only sent to the model address you enter, and never goes into backups or logs. Prefer a key with a spending limit, or a local model (no key needed).",
            ),
          ),
        ],
      ),
      card(
        L("网站", "Sites"),
        L(
          "默认只在 arxiv.org 自动扫描。其他网站可以在这里允许，或标为敏感。",
          "Only arxiv.org is scanned automatically. Allow other sites here, or mark them sensitive.",
        ),
        [
          h(
            "p",
            { className: "note" },
            L(
              "「敏感」适用于不想让内容离开本机的网站（保密论文、内部文档等）：在这些网站上划词时，选中的文字、所在段落、章节和页面标题只会发给本机模型（如 Ollama），不会发给远程服务。若没有可用的本机模型，解释会报错，而不是改用远程模型。记录仍保存在本机浏览器中。使用前请先在上方「模型」里添加本机模型并勾选「敏感来源用」。",
              '"Sensitive" is for sites whose content must not leave this computer (confidential papers, internal documents). On them, the selected text, its paragraph, the section and the page title are sent only to a local model such as Ollama, never to a remote service. With no local model available, the explanation fails instead of falling back to a remote one. Records are still kept in this browser. Add a local model above and tick "For sensitive sources" first.',
            ),
          ),
          ...siteRows,
          draft.sites.length === 0 ? h("p", { className: "empty" }, L("还没有网站规则。", "No site rules yet.")) : null,
          addSite,
        ],
      ),
      card(L("限制与提示", "Limits and hints"), null, [
        h(
          "div",
          { className: "grid four" },
          field(
            L("每分钟解释上限（次）", "Explanations per minute"),
            numberInput(draft.rateLimit.perMinute, (v) => (draft.rateLimit.perMinute = v), { min: "1" }),
          ),
          field(
            L("每小时解释上限（次）", "Explanations per hour"),
            numberInput(draft.rateLimit.perHour, (v) => (draft.rateLimit.perHour = v), { min: "1" }),
          ),
          field(
            L("重逢间隔（天）", "Reunion gap (days)"),
            numberInput(draft.reunion.minGapDays, (v) => (draft.reunion.minGapDays = v), { min: "0" }),
          ),
          field(
            L("每页重逢上限（条）", "Reunions per page"),
            numberInput(draft.reunion.maxPerPage, (v) => (draft.reunion.maxPerPage = v), { min: "1", max: "10" }),
          ),
        ),
      ]),
      card(
        L("备份", "Backup"),
        null,
        [
          choice(
            checkbox(draft.backup.enabled, (v) => (draft.backup.enabled = v)),
            L("每周导出 JSONL 到「下载/harkback」", "Export JSONL to Downloads/harkback every week"),
          ),
          choice(
            checkbox(draft.backup.excludeSensitive, (v) => (draft.backup.excludeSensitive = v), { "data-hb": "exclude-sensitive" }),
            L("备份和导出时不包含敏感来源的内容", "Leave sensitive sources out of backups and exports"),
          ),
        ],
        [backupButton],
      ),
      card(L("隐私", "Privacy"), null, [
        h("ul", { className: "privacy" }, ...privacyNotes(draft.language).map((line) => h("li", {}, line))),
      ]),
      h("div", { className: "savebar" }, h("div", { className: "savebar-inner" }, saveButton, status)),
    );
  }
  render();
}

void main();
