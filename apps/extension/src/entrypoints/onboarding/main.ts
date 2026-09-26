import { ulid } from "@harkback/core";
import { browser } from "wxt/browser";
import { testConnection } from "../../lib/connection";
import { h } from "../../lib/dom";
import { PRIVACY } from "../../lib/pages/privacy";
import { connectionMessage, onboardingSettings, TEMPLATES } from "../../lib/pages/setup";
import { modelUrlError } from "../../lib/routing";
import { withDefaults } from "../../lib/settings";
import { originPattern } from "../../lib/site-rules";
import type { Lang } from "../../lib/ui/strings";

async function main(): Promise<void> {
  let settings = withDefaults((await browser.storage.local.get("settings")).settings);
  let lang: Lang = settings.language;
  const root = document.getElementById("app")!;
  const L = (zh: string, en: string) => (lang === "zh" ? zh : en);

  const render = (): void => {
    const language = h("select", { "data-hb": "language" }, h("option", { value: "zh", selected: lang === "zh" }, "中文"), h("option", { value: "en", selected: lang === "en" }, "English"));
    language.addEventListener("change", () => {
      lang = language.value === "en" ? "en" : "zh";
      render();
    });
    const consent = h("input", { type: "checkbox", "data-hb": "consent" });
    const template = h("select", { "data-hb": "template" }, ...TEMPLATES.map((tp) => h("option", { value: tp.id }, tp.label)));
    const baseUrl = h("input", { type: "url", "data-hb": "base-url", value: TEMPLATES[0].baseUrl });
    template.addEventListener("change", () => {
      const tp = TEMPLATES.find((x) => x.id === template.value);
      if (tp) baseUrl.value = tp.baseUrl;
    });
    const apiKey = h("input", { type: "password", "data-hb": "api-key", autocomplete: "off" });
    const modelList = h("datalist", { id: "models" });
    const model = h("input", { type: "text", "data-hb": "model", list: "models" });
    const result = h("div", { className: "result", "data-hb": "test-result" });

    const test = h("button", { type: "button", "data-hb": "test" }, L("测试连接", "Test connection"));
    test.addEventListener("click", async () => {
      const pattern = originPattern(baseUrl.value.trim());
      if (!pattern || modelUrlError(baseUrl.value)) {
        result.textContent = connectionMessage(lang, { kind: "insecure" }, location.origin);
        return;
      }
      // Must be the first await: permission prompts need the click's user gesture.
      await browser.permissions.request({ origins: [pattern] }).catch(() => false);
      result.textContent = L("正在连接…", "Connecting…");
      const r = await testConnection({ baseUrl: baseUrl.value, apiKey: apiKey.value });
      result.textContent = connectionMessage(lang, r, location.origin);
      if (r.kind === "ok") {
        modelList.replaceChildren(...r.models.map((m) => h("option", { value: m })));
        if (!model.value && r.models[0]) model.value = r.models[0];
      }
    });

    const finish = h("button", { type: "button", "data-hb": "finish" }, L("完成", "Finish"));
    finish.addEventListener("click", async () => {
      if (!consent.checked) {
        result.textContent = L("请先阅读并同意上面的说明。", "Please read and accept the notes above.");
        return;
      }
      const pattern = originPattern(baseUrl.value.trim());
      if (!pattern || modelUrlError(baseUrl.value) || !model.value.trim()) {
        result.textContent = L("请填写有效的模型地址与模型名称。", "Enter a valid model address and model name.");
        return;
      }
      const granted = await browser.permissions.request({ origins: [pattern] }).catch(() => false);
      if (!granted) {
        result.textContent = L("需要允许访问模型地址。", "Access to the model address is required.");
        return;
      }
      const label = TEMPLATES.find((x) => x.id === template.value)?.label ?? "Model";
      settings = onboardingSettings(settings, { language: lang, label, baseUrl: baseUrl.value, apiKey: apiKey.value, model: model.value }, new Date(), () => ulid());
      await browser.storage.local.set({ settings });
      await browser.runtime.sendMessage({ type: "settings-changed" }).catch(() => undefined);
      root.replaceChildren(
        h("h1", {}, "Harkback"),
        h("p", { "data-hb": "done" }, L("设置完成。打开任意 arXiv 论文，选中术语后点「解释」或按 Alt+E。", "All set. Open an arXiv paper, select a term, then click “Explain” or press Alt+E.")),
        h("p", {}, h("a", { href: browser.runtime.getURL("/options.html") }, L("打开设置", "Open settings"))),
      );
    });

    root.replaceChildren(
      h("h1", {}, L("Harkback · 首次设置", "Harkback · Setup")),
      h("p", {}, L("解释语言：", "Explanation language: "), language),
      h("h2", {}, L("开始之前", "Before you start")),
      h("ul", {}, ...PRIVACY[lang].map((line) => h("li", {}, line))),
      h("p", {}, h("label", {}, consent, " ", L("我已阅读并同意", "I have read and agree"))),
      h("h2", {}, L("选择模型", "Choose a model")),
      h("p", {}, template),
      h("p", {}, h("label", {}, L("地址", "Address"), h("br"), baseUrl)),
      h("p", {}, h("label", {}, "API key", h("br"), apiKey), h("br"), h("small", {}, L("保存在浏览器扩展存储中，未加密；本机模型可留空。", "Stored unencrypted in the extension's storage; leave empty for local models."))),
      h("p", {}, h("label", {}, L("模型名称", "Model name"), h("br"), model), modelList, " ", test),
      result,
      h("p", {}, finish),
    );
  };
  render();
}

void main();
