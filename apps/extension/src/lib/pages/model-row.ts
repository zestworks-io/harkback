import { BUILTIN_MODEL, builtInState, downloadBuiltIn } from "../models/builtin-ai";
import { testConnection } from "../models/connection";
import { PROVIDERS, providerById } from "../models/providers";
import { originPattern } from "../source/site-rules";
import type { ModelConfig, Settings } from "../storage/settings";
import { h } from "../ui/dom";
import { pick } from "../ui/pick";
import { secretInput } from "../ui/secret-input";
import { choice, field, input } from "./form";
import { requestOrigins } from "./request";
import { builtInMessage, connectionMessage } from "./setup";

/**
 * One model in Settings: its provider, name, address and key, whether it is the default or the one for sensitive sources,
 * and a connection test. `render` draws the page again after a change that alters the row.
 */
export function modelRow(draft: Settings, m: ModelConfig, i: number, render: () => void): HTMLElement {
  const L = (zh: string, en: string) => pick(draft.language, zh, en);
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
  const result = h("div", { className: "result", role: "status", "aria-live": "polite", "data-hb": "model-result" });
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
    // Off before the permission question, so a second click cannot start a second test.
    test.disabled = true;
    try {
      const pattern = originPattern(m.baseUrl.trim());
      if (pattern) await requestOrigins([pattern]);
      result.toggleAttribute("data-spin", true);
      result.textContent = L("正在连接…", "Connecting…");
      result.textContent = connectionMessage(draft.language, await testConnection(m), location.origin);
    } catch {
      result.textContent = connectionMessage(draft.language, { kind: "unreachable" }, location.origin);
    } finally {
      result.toggleAttribute("data-spin", false);
      test.disabled = false;
    }
  });
  const remove = h("button", { type: "button", className: "small ghost" }, L("删除", "Delete"));
  remove.addEventListener("click", () => {
    draft.models.splice(i, 1);
    if (draft.defaultModelId === m.id) draft.defaultModelId = null;
    if (draft.localModelId === m.id) draft.localModelId = null;
    // A site that used it goes back to the default model; otherwise Save would refuse an id no longer in the list.
    for (const s of draft.sites) if (s.modelId === m.id) delete s.modelId;
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
}
