import { ulid } from "@harkback/core";
import { browser } from "wxt/browser";
import { testConnection, type ConnectionResult } from "../../lib/connection";
import { h } from "../../lib/dom";
import { PRIVACY } from "../../lib/pages/privacy";
import { request, requestOrigins } from "../../lib/pages/request";
import { connectionMessage, onboardingSettings, TEMPLATES } from "../../lib/pages/setup";
import { modelUrlError } from "../../lib/model-policy";
import { withDefaults } from "../../lib/settings";
import { initTheme } from "../../lib/theme";
import { secretInput } from "../../lib/ui/secret-input";
import { originPattern } from "../../lib/site-rules";
import { pick, type Lang } from "../../lib/ui/strings";

type ResultState = "busy" | "ok" | "error" | "help";

function stateOf(r: ConnectionResult): ResultState {
  if (r.kind === "ok") return "ok";
  return r.kind === "origin_blocked" ? "help" : "error";
}

async function main(): Promise<void> {
  void initTheme();
  let settings = withDefaults((await browser.storage.local.get("settings")).settings);
  let lang: Lang = settings.language;
  const root = document.getElementById("app")!;
  const L = (zh: string, en: string) => pick(lang, zh, en);
  // Kept outside render() so switching language does not clear what was typed.
  const form = {
    templateId: TEMPLATES[0].id as string,
    baseUrl: TEMPLATES[0].baseUrl as string,
    apiKey: "",
    model: "",
    consent: false,
    models: [] as string[],
  };

  const render = (): void => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";

    const langButton = (value: Lang, label: string) => {
      const b = h("button", { type: "button", "aria-pressed": String(lang === value) }, label);
      b.addEventListener("click", () => {
        if (lang === value) return;
        lang = value;
        render();
      });
      return b;
    };
    const language = h(
      "div",
      { className: "seg", role: "group", "aria-label": L("解释语言", "Explanation language"), "data-hb": "language" },
      langButton("zh", "中文"),
      langButton("en", "English"),
    );

    const result = h("div", { className: "result", role: "status", "aria-live": "polite", "data-hb": "test-result" });
    const show = (text: string, state: ResultState): void => {
      result.textContent = text;
      result.dataset.state = state;
    };

    const consent = h("input", { type: "checkbox", "data-hb": "consent", checked: form.consent });
    consent.addEventListener("change", () => (form.consent = consent.checked));

    const baseUrl = h("input", { type: "url", "data-hb": "base-url", value: form.baseUrl, spellcheck: "false" });
    baseUrl.addEventListener("input", () => (form.baseUrl = baseUrl.value));
    const providers = h(
      "div",
      { className: "providers", role: "radiogroup", "aria-label": L("模型服务", "Model service"), "data-hb": "template" },
      ...TEMPLATES.map((tp) => {
        const radio = h("input", { type: "radio", name: "template", value: tp.id, checked: form.templateId === tp.id });
        radio.addEventListener("change", () => {
          form.templateId = tp.id;
          form.baseUrl = baseUrl.value = tp.baseUrl;
        });
        return h(
          "label",
          {},
          radio,
          h("span", {}, tp.label),
          h("small", {}, tp.id === "ollama" ? L("本机运行", "Runs locally") : L("云端服务", "Cloud service")),
        );
      }),
    );

    const apiKey = h("input", { type: "password", "data-hb": "api-key", autocomplete: "off", value: form.apiKey });
    apiKey.addEventListener("input", () => (form.apiKey = apiKey.value));
    const modelList = h("datalist", { id: "models" }, ...form.models.map((m) => h("option", { value: m })));
    const model = h("input", {
      type: "text",
      "data-hb": "model",
      list: "models",
      value: form.model,
      spellcheck: "false",
      placeholder: L("先测试连接，再从列表中选择", "Test the connection, then pick from the list"),
    });
    model.addEventListener("input", () => (form.model = model.value));

    const test = h("button", { type: "button", className: "btn", "data-hb": "test" }, L("测试连接", "Test connection"));
    test.addEventListener("click", async () => {
      const pattern = originPattern(baseUrl.value.trim());
      if (!pattern || modelUrlError(baseUrl.value)) {
        show(connectionMessage(lang, { kind: "insecure" }, location.origin), "error");
        return;
      }
      await requestOrigins([pattern]);
      show(L("正在连接…", "Connecting…"), "busy");
      const r = await testConnection({ baseUrl: baseUrl.value, apiKey: apiKey.value });
      show(connectionMessage(lang, r, location.origin), stateOf(r));
      if (r.kind === "ok") {
        form.models = r.models;
        modelList.replaceChildren(...r.models.map((m) => h("option", { value: m })));
        if (!model.value && r.models[0]) form.model = model.value = r.models[0];
      }
    });

    const finish = h("button", { type: "button", className: "btn primary", "data-hb": "finish" }, L("完成设置", "Finish setup"));
    finish.addEventListener("click", async () => {
      if (!consent.checked) {
        show(L("请先阅读并同意上面的说明。", "Please read and accept the notes above."), "error");
        consent.focus();
        return;
      }
      const pattern = originPattern(baseUrl.value.trim());
      if (!pattern || modelUrlError(baseUrl.value) || !model.value.trim()) {
        show(L("请填写有效的模型地址与模型名称。", "Enter a valid model address and model name."), "error");
        return;
      }
      const granted = await requestOrigins([pattern]);
      if (!granted) {
        show(L("需要允许访问模型地址。", "Access to the model address is required."), "error");
        return;
      }
      const label = TEMPLATES.find((x) => x.id === form.templateId)?.label ?? "Model";
      settings = onboardingSettings(
        settings,
        { language: lang, label, baseUrl: baseUrl.value, apiKey: apiKey.value, model: model.value },
        new Date(),
        () => ulid(),
      );
      await browser.storage.local.set({ settings });
      await request({ type: "settings-changed" });
      renderDone();
    });

    root.replaceChildren(
      h("header", { className: "top" }, h("span", { className: "brand" }, "Harkback"), language),
      specimen(),
      h("h1", {}, L("开始使用 Harkback", "Set up Harkback")),
      h(
        "p",
        { className: "lede" },
        L(
          "两步：了解你的文字如何被处理，然后连接一个模型。解释会用上面选择的语言。",
          "Two steps: see how your text is handled, then connect a model. Explanations use the language chosen above.",
        ),
      ),
      h(
        "section",
        { className: "step" },
        h("div", { className: "step-no" }, "1"),
        h(
          "div",
          {},
          h("h2", {}, L("你的文字去向", "Where your text goes")),
          h("p", { className: "hint" }, L("请在继续之前读完。", "Read these before you continue.")),
          h("ul", { className: "notes" }, ...PRIVACY[lang].map((line) => h("li", {}, line))),
          h("label", { className: "check" }, consent, L("我已阅读并同意", "I have read and agree")),
        ),
      ),
      h(
        "section",
        { className: "step" },
        h("div", { className: "step-no" }, "2"),
        h(
          "div",
          {},
          h("h2", {}, L("连接模型", "Connect a model")),
          h(
            "p",
            { className: "hint" },
            L(
              "本机的 Ollama 不会把文字发出这台电脑；云端服务需要 API key。",
              "Ollama keeps text on this computer; cloud services need an API key.",
            ),
          ),
          providers,
          h("label", { className: "field" }, h("span", {}, L("地址", "Address")), baseUrl),
          h(
            "label",
            { className: "field" },
            h("span", {}, "API key"),
            secretInput(apiKey, { show: L("显示", "Show"), hide: L("隐藏", "Hide") }),
            h(
              "small",
              {},
              L(
                "未加密保存在本机浏览器扩展存储中，只发送到上面的模型地址；建议使用有额度限制的 key。本机模型可留空。",
                "Stored unencrypted in this browser's extension storage and only sent to the address above; prefer a key with a spending limit. Leave empty for local models.",
              ),
            ),
          ),
          h(
            "div",
            { className: "row" },
            h("label", { className: "field" }, h("span", {}, L("模型名称", "Model name")), model),
            modelList,
            test,
          ),
        ),
      ),
      h("div", { className: "finish" }, finish, result),
    );
  };

  const specimen = (): HTMLElement =>
    h(
      "figure",
      { className: "specimen", "aria-label": L("重逢提示示例", "Example of a reunion hint") },
      h(
        "blockquote",
        { lang: "en" },
        "QLoRA backpropagates gradients through a frozen, 4-bit quantized pretrained language model into ",
        h("span", { className: "term" }, "Low Rank Adapters"),
        " (LoRA).",
        h("cite", {}, "arXiv 2305.14314"),
      ),
      h(
        "figcaption",
        { className: "margin-note" },
        h("strong", {}, L("你见过这个词", "You've met this term")),
        L(
          "三周前在 2106.09685 中读到过。Harkback 会在新论文里把它标出来，并带回你当时的理解。",
          "You read about it in 2106.09685 three weeks ago. Harkback marks it in new papers and brings back what you understood then.",
        ),
      ),
    );

  const renderDone = (): void => {
    root.replaceChildren(
      h("header", { className: "top" }, h("span", { className: "brand" }, "Harkback")),
      h(
        "section",
        { className: "done" },
        h("h1", { "data-hb": "done" }, L("设置完成", "You're set up")),
        h("p", { className: "lede" }, L("试一次：", "Try it once:")),
        h(
          "ol",
          { className: "next" },
          h("li", {}, L("打开任意一篇 arXiv 论文。", "Open any arXiv paper.")),
          h("li", {}, L("选中一个术语。", "Select a term.")),
          h("li", {}, L("点「解释」，或按 ", "Click “Explain”, or press "), h("kbd", {}, "Alt"), " + ", h("kbd", {}, "E"), L("。", ".")),
        ),
        h(
          "p",
          {},
          h("a", { href: browser.runtime.getURL("/library.html") }, L("查看历史与搜索", "History and search")),
          " · ",
          h("a", { href: browser.runtime.getURL("/options.html") }, L("打开设置", "Open settings")),
        ),
        h(
          "p",
          { className: "lede" },
          L(
            "PDF 也可以读：在 PDF 页面点工具栏按钮，arXiv 的论文会打开 HTML 版本，其他 PDF 会在 Harkback 的阅读页中打开。本地 PDF 需要两步授权：先在 chrome://extensions 中为 Harkback 开启「允许访问文件网址」，再在阅读页点「允许读取本地文件」。",
            'PDFs work too: click the toolbar button on a PDF. An arXiv paper opens its HTML version; any other PDF opens in Harkback\'s reader. A PDF on your computer needs two approvals: turn on "Allow access to file URLs" for Harkback in chrome://extensions, then click "Allow local files" on the reader page.',
          ),
        ),
      ),
    );
  };

  render();
}

void main();
