import { EXPLAIN_LANGUAGES, ulid } from "@harkback/core";
import { browser } from "wxt/browser";
import { testConnection } from "../../lib/models/connection";
import { h } from "../../lib/ui/dom";
import { languagePanel } from "../../lib/ocr/panel";
import { privacyNotes } from "../../lib/pages/privacy";
import { backupNow, request, requestOrigins } from "../../lib/pages/request";
import { builtInMessage, connectionMessage } from "../../lib/pages/setup";
import { BUILTIN_MODEL, builtInState, downloadBuiltIn } from "../../lib/models/builtin-ai";
import { validateSettings, withDefaults, type Settings, type SiteRule } from "../../lib/storage/settings";
import { applyTheme } from "../../lib/ui/theme";
import { PROVIDERS, providerById } from "../../lib/models/providers";
import { addSuggestedSites, addVideoSites, hostPermissionPatterns, originPattern } from "../../lib/source/site-rules";
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

type TabId = "general" | "models" | "sites" | "pdf" | "data";
const TAB_IDS: readonly TabId[] = ["general", "models", "sites", "pdf", "data"];

async function main(): Promise<void> {
  let activeTab: TabId = TAB_IDS.find((t) => t === location.hash.slice(1)) ?? "models";
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
    const granted = origins.length === 0 || (await requestOrigins(origins));
    Object.assign(draft, next);
    await browser.storage.local.set({ settings: next });
    await request({ type: "settings-changed" });
    // The rows still hold the objects from before the save; drawing them again keeps the next edit from being lost.
    render();
    status.textContent = granted
      ? L("已保存。", "Saved.")
      : L(
          "已保存，但网站访问权限未授予，自动扫描暂不生效。",
          "Saved, but site access was not granted, so automatic scanning will not run.",
        );
  }

  const ocrHost = h("div", { "data-hb": "ocr-host" });
  let suggestMessage = "";

  function render(): void {
    void languagePanel({ L }).then((panel) => ocrHost.replaceChildren(panel));
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
        } else if (previous.apiType === "builtin") {
          // The built-in model's placeholder address is no address to keep.
          m.baseUrl = "";
        }
        // The built-in model has one fixed name; leaving it behind, the name is typed again.
        if (p.apiType === "builtin") {
          m.model = BUILTIN_MODEL;
          // It takes no key; one left over from another provider would stay in the saved settings, out of sight.
          m.apiKey = "";
        } else if (previous.apiType === "builtin") m.model = "";
        render();
      });
      const preset = providerById(m.provider);
      const result = h("div", { className: "result", "data-hb": "model-result" });
      const test = h("button", { type: "button", className: "small", "data-hb": "model-test" }, L("测试连接", "Test connection"));
      const builtIn = preset.apiType === "builtin";
      const download = h(
        "button",
        { type: "button", className: "small", hidden: true, "data-hb": "model-download" },
        L("下载模型", "Download model"),
      );
      const showState = async (): Promise<void> => {
        const state = await builtInState();
        result.textContent = builtInMessage(draft.language, state);
        download.hidden = state !== "downloadable";
      };
      download.addEventListener("click", async () => {
        download.disabled = true;
        result.textContent = builtInMessage(draft.language, "downloading", 0);
        // Chrome only starts a download from a click, so it runs here and not in the background.
        const state = await downloadBuiltIn((fraction) => (result.textContent = builtInMessage(draft.language, "downloading", fraction)));
        result.textContent = builtInMessage(draft.language, state);
        download.hidden = state !== "downloadable";
        download.disabled = false;
      });
      if (builtIn) void showState();
      test.addEventListener("click", async () => {
        if (builtIn) return showState();
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
          ...(builtIn
            ? [
                h(
                  "p",
                  { className: "note", style: "grid-column: 1 / -1", "data-hb": "model-builtin-note" },
                  L(
                    "在这台电脑上运行，不需要地址和 API key。英语、西班牙语、日语效果最好。",
                    "Runs on this computer, with no address or API key. Works best in English, Spanish and Japanese.",
                  ),
                ),
                h(
                  "p",
                  { className: "note", style: "grid-column: 1 / -1", "data-hb": "model-builtin-slow" },
                  L(
                    "这是一个运行在本机的小模型：比云端模型慢，第一次请求尤其慢，回答也更简单。适合简短的解释；长内容请用云端或 Ollama 模型。",
                    "This is a small model running on your computer: expect it to be slower than a cloud model, especially on the first request, and its answers to be simpler. It suits short explanations; use a cloud or Ollama model for longer ones.",
                  ),
                ),
              ]
            : [
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
              ]),
        ),
        h(
          "div",
          { className: "item-foot" },
          choice(isDefault, L("默认模型", "Default")),
          choice(isLocal, L("敏感来源服务", "Sensitive provider")),
          h("span", { className: "spacer" }),
          ...(builtIn ? [download] : []),
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

    const addYouTube = h(
      "button",
      { type: "button", className: "add", "data-hb": "add-youtube" },
      L("+ YouTube 字幕", "+ YouTube captions"),
    );
    addYouTube.addEventListener("click", () => {
      suggestMessage =
        addVideoSites(draft.sites) > 0
          ? L(
              "已添加 YouTube。点击保存后，浏览器会询问网站访问权限。播放时请打开字幕（CC）。",
              "Added YouTube. Save to grant site access; the browser asks once. Turn on captions (CC) while you watch.",
            )
          : L("YouTube 已有规则。", "YouTube already has a rule.");
      render();
    });

    const suggestNote = h("p", { className: "note", "data-hb": "suggest-note" }, suggestMessage);
    const suggestSites = h(
      "button",
      { type: "button", className: "add", "data-hb": "suggest-sites" },
      L("+ 推荐的研究网站", "+ Suggested research sites"),
    );
    suggestSites.addEventListener("click", () => {
      const added = addSuggestedSites(draft.sites);
      suggestMessage =
        added > 0
          ? L(
              "已添加 {n} 个网站。点击保存后，浏览器会一次性询问网站访问权限。",
              "Added {n} sites. Save to grant site access; the browser asks once.",
              { n: added },
            )
          : L("这些网站都已有规则。", "These sites already have rules.");
      render();
    });

    const saveButton = h("button", { type: "button", className: "primary", "data-hb": "save" }, L("保存", "Save changes"));
    saveButton.addEventListener("click", () => void save());
    const backupButton = h("button", { type: "button", className: "small", "data-hb": "backup-now" }, L("立即备份", "Back up now"));
    backupButton.addEventListener("click", async () => {
      status.textContent = await backupNow(draft.language);
    });

    const tabs: { id: TabId; label: string }[] = [
      { id: "general", label: L("常规", "General") },
      { id: "models", label: L("模型", "Models") },
      { id: "sites", label: L("网站", "Sites") },
      { id: "pdf", label: L("扫描版 PDF", "Scanned PDFs") },
      { id: "data", label: L("数据与隐私", "Data and privacy") },
    ];
    const select = (id: TabId): void => {
      activeTab = id;
      history.replaceState(null, "", `#${id}`);
      render();
      root.querySelector<HTMLElement>(`[data-hb="tab-${id}"]`)?.focus();
    };
    const tabBar = h(
      "div",
      { className: "tabs", role: "tablist" },
      ...tabs.map((t, i) => {
        const b = h(
          "button",
          {
            type: "button",
            role: "tab",
            id: `tab-${t.id}`,
            className: "tab",
            "data-hb": `tab-${t.id}`,
            "aria-selected": String(activeTab === t.id),
            "aria-controls": `panel-${t.id}`,
            tabIndex: activeTab === t.id ? 0 : -1,
          },
          t.label,
        );
        b.addEventListener("click", () => select(t.id));
        b.addEventListener("keydown", (e) => {
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (step) {
            e.preventDefault();
            select(tabs[(i + step + tabs.length) % tabs.length]!.id);
          }
        });
        return b;
      }),
    );
    const tabPanels = (list: { id: TabId }[], ...groups: Node[][]): Node[] =>
      list.map((t, i) =>
        h(
          "div",
          { className: "tab-panel", role: "tabpanel", id: `panel-${t.id}`, "aria-labelledby": `tab-${t.id}`, hidden: activeTab !== t.id },
          ...groups[i]!,
        ),
      );

    root.replaceChildren(
      h(
        "div",
        { className: "page-head" },
        h(
          "div",
          {},
          h("h1", {}, L("Harkback 设置", "Harkback settings")),
          h("p", { className: "sub" }, L("模型、网站、扫描与隐私。", "Models, sites, scanning and privacy.")),
        ),
        h(
          "div",
          { className: "head-tools" },
          h("a", { href: browser.runtime.getURL("/library.html") }, L("历史与搜索", "History and search")),
          theme,
          language,
        ),
      ),
      tabBar,
      ...tabPanels(
        tabs,
        [
          card(
            L("解释语言", "Explanation language"),
            L(
              "解释和追问的回答用这种语言书写；术语保持原文。模型的回答质量因语言而异。",
              "Explanations and follow-up answers are written in this language; technical terms stay in their original form. Quality varies by language and model.",
            ),
            [explainLanguage],
          ),
          card(L("复习", "Review"), null, [
            h(
              "div",
              { className: "grid four" },
              field(
                L("目标记忆率（%）", "Target recall (%)"),
                numberInput(Math.round(draft.review.desiredRetention * 100), (v) => (draft.review.desiredRetention = Math.round(v) / 100), {
                  min: "70",
                  max: "97",
                  "data-hb": "desired-retention",
                }),
              ),
            ),
            h(
              "p",
              { className: "note" },
              L(
                "术语到期时你希望还记得的概率。越高，复习越频繁；默认 90。",
                "How likely you want to be to remember a term when it comes due. Higher means more reviews; the default is 90.",
              ),
            ),
            choice(
              checkbox(draft.review.modelCheck, (v) => (draft.review.modelCheck = v), { "data-hb": "model-check" }),
              L("在复习中提供「检查我的回答」", "Offer “Check my answer” in review"),
            ),
            h(
              "p",
              { className: "note" },
              L(
                "点击这个按钮时，Harkback 会把术语、你输入的回答和当时的解释发给你的模型。它使用你平时的模型选择：敏感来源只会发给本机模型，并且计入每分钟和每小时的上限。关闭后按钮不会出现，也不会发送任何内容。",
                "When you press it, Harkback sends the term, your typed answer and its stored explanation to your model. It uses your normal model choice, so sensitive sources only go to a local model, and each check counts against your per-minute and per-hour limits. Turn this off and the button never appears and nothing is sent.",
              ),
            ),
          ]),
          card(L("速率限制", "Rate limits"), null, [
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
            ),
            h(
              "p",
              { className: "note" },
              L(
                "限制 Harkback 向你的模型发出解释请求的次数，避免按量计费的 API 产生意外账单。达到上限后，新的请求会被拒绝，并提示多少秒后重试。",
                "Caps how many times Harkback may ask your model to explain something, so a paid API key cannot run up a surprise bill. Once a cap is reached, new requests are refused with a note saying how many seconds to wait.",
              ),
            ),
          ]),
          card(L("重逢提示", "Reunion hints"), null, [
            h(
              "div",
              { className: "grid four" },
              field(
                L("重逢间隔（天）", "Reunion gap (days)"),
                numberInput(draft.reunion.minGapDays, (v) => (draft.reunion.minGapDays = v), { min: "0" }),
              ),
              field(
                L("每页重逢上限（条）", "Reunions per page"),
                numberInput(draft.reunion.maxPerPage, (v) => (draft.reunion.maxPerPage = v), { min: "1", max: "10" }),
              ),
            ),
            h(
              "p",
              { className: "note" },
              L(
                "重逢提示是在新页面上标出你以前见过的术语。间隔是指距你上次查看该术语至少过了多少天才会再次标出（0 表示立即标出）；每页上限避免一页被下划线铺满。",
                "A reunion hint underlines a term on a new page that you have met before. The gap is how many days must pass since you last looked at a term before it is marked again (0 marks it straight away); the per-page limit keeps a page from being covered in underlines.",
              ),
            ),
          ]),
        ],
        [
          card(
            L("模型", "Models"),
            L(
              "纯 http 只允许用于本机（127.0.0.1 / localhost）和你自己网络里的服务器（192.168.x.x、10.x.x.x、name.local、Tailscale）；其他地址必须使用 https。自己网络里的服务器仍算远程。勾选「敏感来源服务」的本机模型（127.0.0.1 / localhost）会用于敏感来源；敏感来源不会使用其他模型。",
              'Plain http is only allowed for this computer (127.0.0.1 / localhost) and for servers on your own network (192.168.x.x, 10.x.x.x, name.local, Tailscale); every other address must use https. A server on your own network still counts as remote. A local model (127.0.0.1 / localhost) ticked "Sensitive provider" is the one used for sensitive sources; they never use any other model.',
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
          card(L("模型超时", "Model timeouts"), null, [
            h(
              "div",
              { className: "grid four" },
              field(
                L("模型停顿超时（秒）", "Model idle timeout (seconds)"),
                numberInput(draft.timeouts.idleSeconds, (v) => (draft.timeouts.idleSeconds = v), {
                  min: "5",
                  max: "600",
                  "data-hb": "idle-timeout",
                }),
              ),
              field(
                L("等待首个字的超时（秒）", "Wait for first text (seconds)"),
                numberInput(draft.timeouts.firstTextSeconds, (v) => (draft.timeouts.firstTextSeconds = v), {
                  min: "10",
                  max: "1800",
                  "data-hb": "first-text-timeout",
                }),
              ),
            ),
            h(
              "p",
              { className: "note" },
              L(
                "回答开始后，模型停顿超过「停顿超时」就会放弃；推理型模型在写出第一个字前可能想很久，所以首个字的等待时间单独设置。",
                "Once an answer has started, a model that goes quiet for longer than the idle timeout is given up on. Reasoning models can think for a long time before the first word, so that wait is set separately.",
              ),
            ),
          ]),
        ],
        [
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
                  "「敏感」适用于不想让内容离开本机的网站（保密论文、内部文档等）：在这些网站上划词时，选中的文字、所在段落、章节和页面标题只会发给本机模型（如 Ollama），不会发给远程服务。若没有可用的本机模型，解释会报错，而不是改用远程模型。记录仍保存在本机浏览器中。使用前请先在上方「模型」里添加本机模型并勾选「敏感来源服务」。",
                  '"Sensitive" is for sites whose content must not leave this computer (confidential papers, internal documents). On them, the selected text, its paragraph, the section and the page title are sent only to a local model such as Ollama, never to a remote service. With no local model available, the explanation fails instead of falling back to a remote one. Records are still kept in this browser. Add a local model above and tick "Sensitive provider" first.',
                ),
              ),
              h(
                "p",
                { className: "note" },
                L(
                  "notion.so 和 docs.google.com 上的页面，除非已发布或上面的规则另有设置，否则在发送任何内容之前都会先询问。GitHub 页面只有在看起来是私有的时候才会询问。",
                  "Pages on notion.so and docs.google.com ask before anything is sent, unless the page is published or a rule above says otherwise. A GitHub page asks only when it looks private.",
                ),
              ),
              ...siteRows,
              draft.sites.length === 0 ? h("p", { className: "empty" }, L("还没有网站规则。", "No site rules yet.")) : null,
              addSite,
              suggestSites,
              addYouTube,
              suggestNote,
              h(
                "p",
                { className: "note" },
                L(
                  "推荐网站：bioRxiv、medRxiv、PubMed（只有摘要）、SSRN、OpenReview 和 ACL Anthology，都会自动扫描。",
                  "Suggested sites: bioRxiv, medRxiv, PubMed (abstracts only), SSRN, OpenReview and ACL Anthology, all scanned automatically.",
                ),
              ),
              h(
                "p",
                { className: "note" },
                L(
                  "YouTube 不在推荐网站里，需要时单独添加。Harkback 只读取播放器正在显示的字幕，不会下载字幕文件；字幕里划线的词也不会出现在 YouTube 页面的代码中。",
                  "YouTube is not among the suggested sites; add it when you want it. Harkback reads only the captions the player is showing and does not download caption files, and the underlines are not part of YouTube's page.",
                ),
              ),
            ],
          ),
        ],
        [
          card(
            L("扫描版 PDF 的识别语言", "Languages for scanned PDFs"),
            L(
              "扫描版 PDF 在本机识别文字，页面图像不会离开你的电脑。",
              "Text in scanned PDFs is read on this computer; page images never leave it.",
            ),
            [ocrHost],
          ),
        ],
        [
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
        ],
      ),
      h("div", { className: "savebar" }, h("div", { className: "savebar-inner" }, saveButton, status)),
    );
  }
  render();
}

void main();
