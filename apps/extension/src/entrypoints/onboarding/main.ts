import { ulid } from "@harkback/core";
import { browser } from "wxt/browser";
import { testConnection, type ConnectionResult } from "../../lib/models/connection";
import { h } from "../../lib/ui/dom";
import { privacyNotes } from "../../lib/pages/privacy";
import { request, requestOrigins } from "../../lib/pages/request";
import { builtInMessage, connectionMessage, onboardingSettings } from "../../lib/pages/setup";
import { BUILTIN_MODEL, BUILTIN_URL, builtInState, downloadBuiltIn, type BuiltInState } from "../../lib/models/builtin-ai";
import { PROVIDERS, providerById } from "../../lib/models/providers";
import { modelUrlError } from "../../lib/models/model-policy";
import { withDefaults } from "../../lib/storage/settings";
import { initTheme } from "../../lib/ui/theme";
import { secretInput } from "../../lib/ui/secret-input";
import { originPattern } from "../../lib/source/site-rules";
import { isLang, UI_LANGUAGES, type Lang } from "../../lib/ui/languages";
import { pick } from "../../lib/ui/pick";

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
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  // Kept outside render() so switching language does not clear what was typed.
  const form = {
    templateId: PROVIDERS[0]!.id,
    baseUrl: PROVIDERS[0]!.baseUrl,
    apiKey: "",
    model: "",
    consent: false,
    models: [] as string[],
  };
  // Also outside render(), so the example stays open when the language changes.
  let sampleOpen = false;
  let step = 0;
  // Also outside render(): a download goes on while the steps are redrawn, and its progress must reach the card now showing.
  const builtin = {
    state: undefined as BuiltInState | undefined,
    percent: undefined as number | undefined,
    downloading: false,
    paint: () => {},
  };
  const go = (to: number): void => {
    step = Math.max(0, Math.min(2, to));
    render();
    window.scrollTo(0, 0);
  };

  const render = (): void => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;

    const language = h(
      "select",
      { className: "lang-select", "aria-label": L("界面语言", "Interface language"), "data-hb": "language" },
      ...UI_LANGUAGES.map((l) => h("option", { value: l.code, selected: lang === l.code }, l.native)),
    );
    language.addEventListener("change", () => {
      if (!isLang(language.value) || language.value === lang) return;
      lang = language.value;
      render();
    });

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
      ...PROVIDERS.map((tp) => {
        const radio = h("input", { type: "radio", name: "template", value: tp.id, checked: form.templateId === tp.id });
        radio.addEventListener("change", () => {
          form.templateId = tp.id;
          // "Custom" keeps whatever address was typed; the others fill in theirs.
          if (tp.baseUrl) form.baseUrl = baseUrl.value = tp.baseUrl;
          sync();
          model.placeholder = tp.modelHint || L("先测试连接，再从列表中选择", "Test the connection, then pick from the list");
        });
        return h(
          "label",
          {},
          radio,
          h(
            "span",
            {},
            tp.id === "custom" ? L("自定义", "Custom") : tp.apiType === "builtin" ? L("Chrome 内置 (Gemini Nano)", tp.label) : tp.label,
          ),
          h(
            "small",
            {},
            tp.apiType === "builtin"
              ? L("Chrome 自带，无需设置", "Ships with Chrome, nothing to set up")
              : tp.local
                ? L("本机运行", "Runs locally")
                : tp.id === "custom"
                  ? L("其他地址", "Any address")
                  : L("云端服务", "Cloud service"),
          ),
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
      const r = await testConnection({ baseUrl: baseUrl.value, apiKey: apiKey.value, provider: form.templateId });
      show(connectionMessage(lang, r, location.origin), stateOf(r));
      if (r.kind === "ok") {
        form.models = r.models;
        modelList.replaceChildren(...r.models.map((m) => h("option", { value: m })));
        if (!model.value && r.models[0]) form.model = model.value = r.models[0];
      }
    });

    const builtIn = (): boolean => providerById(form.templateId).apiType === "builtin";
    const builtInResult = h("div", { className: "result", role: "status", "aria-live": "polite", "data-hb": "builtin-result" });
    const download = h(
      "button",
      { type: "button", className: "btn", hidden: true, "data-hb": "builtin-download" },
      L("下载模型", "Download model"),
    );
    // Finish waits while the model downloads; the card's own text says how far it is.
    const paint = (): void => {
      const { state, percent } = builtin;
      finish.disabled = builtIn() && builtin.downloading;
      if (!state) return;
      builtInResult.textContent = builtInMessage(lang, state, percent);
      builtInResult.dataset.state = state === "available" ? "ok" : state === "downloading" || state === "downloadable" ? "busy" : "error";
      download.hidden = state !== "downloadable";
      download.disabled = builtin.downloading;
    };
    builtin.paint = paint;
    const showBuiltIn = (state: BuiltInState, percent?: number): void => {
      builtin.state = state;
      builtin.percent = percent;
      builtin.paint();
    };
    download.addEventListener("click", async () => {
      builtin.downloading = true;
      showBuiltIn("downloading", 0);
      // Chrome only starts a download from a click, so it runs here.
      const after = await downloadBuiltIn((fraction) => showBuiltIn("downloading", fraction));
      builtin.downloading = false;
      showBuiltIn(after);
    });
    const builtInPanel = h(
      "div",
      { className: "builtin", "data-hb": "builtin-panel" },
      h(
        "p",
        { className: "hint" },
        L(
          "在这台电脑上运行，不需要地址和 API key。英语、西班牙语、日语效果最好。",
          "Runs on this computer, with no address or API key. Works best in English, Spanish and Japanese.",
        ),
      ),
      h(
        "p",
        { className: "hint", "data-hb": "builtin-slow" },
        L(
          "这是一个运行在本机的小模型：比云端模型慢，第一次请求尤其慢，回答也更简单。适合简短的解释；长内容请用云端或 Ollama 模型。",
          "This is a small model running on your computer: expect it to be slower than a cloud model, especially on the first request, and its answers to be simpler. It suits short explanations; use a cloud or Ollama model for longer ones.",
        ),
      ),
      builtInResult,
      download,
    );
    const remoteFields = h(
      "div",
      { "data-hb": "remote-fields" },
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
    );
    const sync = (): void => {
      remoteFields.hidden = builtIn();
      builtInPanel.hidden = !builtIn();
      // A download under way already knows more than Chrome's one-word answer.
      if (builtIn() && !builtin.downloading) void builtInState().then((state) => showBuiltIn(state));
      paint();
    };

    const finish = h("button", { type: "button", className: "btn primary", "data-hb": "finish" }, L("完成设置", "Finish setup"));
    finish.addEventListener("click", async () => {
      if (!consent.checked) {
        show(L("请先阅读并同意上面的说明。", "Please read and accept the notes above."), "error");
        consent.focus();
        return;
      }
      if (builtIn()) {
        if (builtin.state !== "available") {
          show(
            L("先让 Chrome 的内置模型可用，或选择其他服务。", "Get Chrome's built-in model ready first, or pick another service."),
            "error",
          );
          return;
        }
        const label = providerById(form.templateId).label;
        settings = onboardingSettings(
          settings,
          { language: lang, label, baseUrl: BUILTIN_URL, apiKey: "", model: BUILTIN_MODEL, provider: form.templateId },
          new Date(),
          () => ulid(),
        );
        await browser.storage.local.set({ settings });
        await request({ type: "settings-changed" });
        renderDone();
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
      const label = providerById(form.templateId).label;
      settings = onboardingSettings(
        settings,
        { language: lang, label, baseUrl: baseUrl.value, apiKey: apiKey.value, model: model.value, provider: form.templateId },
        new Date(),
        () => ulid(),
      );
      await browser.storage.local.set({ settings });
      await request({ type: "settings-changed" });
      renderDone();
    });

    const titles = [L("欢迎", "Welcome"), L("隐私", "Privacy"), L("模型", "Model")];
    const stepper = h(
      "ol",
      { className: "stepper", "aria-label": L("设置进度", "Setup progress"), "data-hb": "stepper" },
      ...titles.map((title, i) => {
        const dot = h("span", { className: "dot" }, i < step ? "✓" : String(i + 1));
        const label = h("span", { className: "label" }, title);
        const state = i < step ? "done" : i === step ? "current" : "todo";
        // A step already passed can be revisited; one ahead is reached with Next.
        const body =
          i < step
            ? h("button", { type: "button", className: "stepper-link", "data-hb": `step-${i}` }, dot, label)
            : h("span", { className: "stepper-link" }, dot, label);
        if (i < step) body.addEventListener("click", () => go(i));
        return h("li", { className: state, ...(i === step ? { "aria-current": "step" } : {}) }, body);
      }),
    );

    const welcome = h(
      "section",
      { className: "panel", "data-hb": "panel-welcome" },
      h("h1", {}, L("开始使用 Harkback", "Set up Harkback")),
      h(
        "p",
        { className: "lede" },
        L(
          "三步：看看它能做什么，了解你的文字如何被处理，然后连接一个模型。解释会用上面选择的语言。",
          "Three steps: see what it does, see how your text is handled, then connect a model. Explanations use the language chosen above.",
        ),
      ),
      specimen(),
      sample(),
    );
    const privacy = h(
      "section",
      { className: "panel", "data-hb": "panel-privacy" },
      h("h2", {}, L("你的文字去向", "Where your text goes")),
      h("p", { className: "hint" }, L("请在继续之前读完。", "Read these before you continue.")),
      h("ul", { className: "notes" }, ...privacyNotes(lang).map((line) => h("li", {}, line))),
      h("label", { className: "check" }, consent, L("我已阅读并同意", "I have read and agree")),
    );
    const connect = h(
      "section",
      { className: "panel", "data-hb": "panel-model" },
      h("h2", {}, L("连接模型", "Connect a model")),
      h(
        "p",
        { className: "hint" },
        L(
          "Ollama 和 Chrome 内置模型不会把文字发出这台电脑；云端服务需要 API key。",
          "Ollama and Chrome's built-in model keep text on this computer; cloud services need an API key.",
        ),
      ),
      providers,
      builtInPanel,
      remoteFields,
      h(
        "p",
        { className: "hint more-in-settings", "data-hb": "more-in-settings" },
        L("更多模型和选项可以之后在设置中添加。", "You can add more models and change options later in Settings."),
      ),
    );

    const back = h("button", { type: "button", className: "btn", "data-hb": "back" }, L("上一步", "Back"));
    back.addEventListener("click", () => go(step - 1));
    const next = h("button", { type: "button", className: "btn primary", "data-hb": "next" }, L("下一步", "Next"));
    // Next stays disabled on the privacy step until the notes are accepted.
    const syncNext = (): void => {
      next.disabled = step === 1 && !consent.checked;
    };
    consent.addEventListener("change", syncNext);
    next.addEventListener("click", () => {
      if (!next.disabled) go(step + 1);
    });
    syncNext();
    back.hidden = step === 0;
    next.hidden = step === titles.length - 1;
    finish.hidden = step !== titles.length - 1;

    root.replaceChildren(
      h("header", { className: "top" }, h("span", { className: "brand" }, "Harkback"), language),
      stepper,
      [welcome, privacy, connect][step]!,
      h("div", { className: "finish" }, back, next, finish, result),
    );
    sync();
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

  /** A canned explanation, so the first look at the card does not wait for a model; nothing is sent anywhere. */
  const sample = (): HTMLElement => {
    const toggle = h(
      "button",
      { type: "button", className: "term sample-term", "data-hb": "sample-term", "aria-expanded": String(sampleOpen) },
      "low-rank adapter",
    );
    const card = h(
      "div",
      { className: "sample-card", "data-hb": "sample-card", role: "status", hidden: !sampleOpen },
      h("div", { className: "sample-meta" }, L("示例，没有调用任何模型", "Example only: no model was called")),
      h(
        "p",
        {},
        L(
          "低秩适配器（LoRA）冻结预训练权重，只在旁边训练两个小矩阵，所以只有极小一部分参数会改变。",
          "A low-rank adapter (LoRA) freezes the pretrained weights and trains two small matrices beside them, so only a tiny fraction of the parameters changes.",
        ),
      ),
      h(
        "p",
        { className: "sample-next" },
        L("连接模型后，你读到的任何术语都能得到这样的解释。", "Connect a model below to get explanations like this for anything you read."),
      ),
    );
    toggle.addEventListener("click", () => {
      sampleOpen = !sampleOpen;
      card.hidden = !sampleOpen;
      toggle.setAttribute("aria-expanded", String(sampleOpen));
    });
    return h(
      "section",
      { className: "sample", "data-hb": "sample", "aria-label": L("先试一试", "Try it first") },
      h("h2", {}, L("先试一试", "Try it first")),
      h(
        "p",
        { className: "sample-text", lang: "en" },
        "To fine-tune a large model cheaply, you can add a ",
        toggle,
        " to each layer instead of updating every weight.",
      ),
      h(
        "p",
        { className: "hint" },
        L("点击带下划线的词，看看解释是什么样子。", "Click the underlined term to see what an explanation looks like."),
      ),
      card,
    );
  };

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
          h(
            "li",
            {},
            L("在 Chrome 中打开一篇 arXiv 论文，例如 ", "Open an arXiv paper in Chrome, for example "),
            h("a", { href: "https://arxiv.org/abs/1706.03762", target: "_blank", rel: "noopener" }, "Attention Is All You Need"),
            L("。", "."),
          ),
          h("li", {}, L("拖动选中一个想让它解释的词或短语。", "Drag to select a word or phrase you want explained.")),
          h(
            "li",
            {},
            L("点选区旁边的「解释」按钮，或按 ", "Click the Explain button next to your selection, or press "),
            h("kbd", {}, "Alt"),
            " + ",
            h("kbd", {}, "Shift"),
            " + ",
            h("kbd", {}, "E"),
            L("。", "."),
          ),
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
          { className: "hint" },
          L(
            "设置里还可以添加更多模型、按网站调整、扫描版 PDF、复习和数据导出。",
            "Settings has more: extra models, per-site rules, scanned PDFs, review and data export.",
          ),
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
