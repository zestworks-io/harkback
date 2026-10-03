import { h } from "../dom";
import { BUNDLED_LANGUAGE, languageName, OCR_LANGUAGES, PACK_HOST_NAME, type OcrLanguage } from "./languages";
import { installPack, PackError } from "./install";
import { installedPacks, removePack } from "./store";

type Translate = (zh: string, en: string, vars?: Record<string, string | number>) => string;

export interface PanelOptions {
  L: Translate;
  /** When given, each installed language gets a checkbox and the panel offers to read the document again with the ticked ones. */
  choose?: { chosen: readonly string[]; apply(langs: string[]): void };
}

const megabytes = (bytes: number): string => (bytes / 1_000_000).toFixed(1);

/** The list of OCR languages: install or remove each one, and, in the reader, pick the ones to read a document with. */
export async function languagePanel({ L, choose }: PanelOptions): Promise<HTMLElement> {
  const root = h("div", { className: "hb-ocr-langs", "data-hb": "ocr-languages" });
  const message = h("p", { className: "hb-ocr-message", "data-hb": "ocr-message", role: "status" });
  const ticked = new Set(choose?.chosen ?? [BUNDLED_LANGUAGE]);
  let installed = new Set(await installedPacks().catch(() => [] as string[]));

  const row = (lang: OcrLanguage | null): HTMLElement => {
    const code = lang?.code ?? BUNDLED_LANGUAGE;
    const have = lang === null || installed.has(code);
    const box = choose
      ? h("input", { type: "checkbox", checked: ticked.has(code), disabled: !have, "data-hb": `ocr-choose-${code}` })
      : null;
    box?.addEventListener("change", () => {
      if (box.checked) ticked.add(code);
      else ticked.delete(code);
    });
    const action = lang
      ? h(
          "button",
          { type: "button", className: "small", "data-hb": `ocr-${have ? "remove" : "install"}-${code}` },
          have ? L("移除", "Remove") : L("安装", "Install"),
        )
      : null;
    action?.addEventListener("click", async () => {
      action.disabled = true;
      message.textContent = "";
      try {
        if (have) {
          await removePack(code);
          ticked.delete(code);
        } else {
          action.textContent = L("安装中…", "Installing…");
          await installPack(code);
        }
        installed = new Set(await installedPacks());
        render();
      } catch (e) {
        message.textContent =
          e instanceof PackError && e.kind === "mismatch"
            ? L("{name} 的校验值不符，已丢弃。", "The download of {name} did not match its checksum and was discarded.", {
                name: languageName(code),
              })
            : L("无法下载 {name}，请检查网络后重试。", "Could not download {name}. Check your connection and try again.", {
                name: languageName(code),
              });
        render();
      }
    });
    return h(
      "label",
      { className: "hb-ocr-row" },
      box,
      h("span", { className: "hb-ocr-name" }, lang ? lang.native : "English"),
      h("span", { className: "hb-ocr-size" }, lang ? `${megabytes(lang.size)} MB` : L("内置", "Built in")),
      action,
    );
  };

  function render(): void {
    const apply = choose ? h("button", { type: "button", "data-hb": "ocr-apply" }, L("用所选语言重新识别", "Read again with these")) : null;
    apply?.addEventListener("click", () => choose!.apply([...ticked].filter((c) => c === BUNDLED_LANGUAGE || installed.has(c))));
    root.replaceChildren(
      h(
        "p",
        { className: "hb-ocr-note" },
        L(
          "英文已内置。其他语言只需从 {host} 下载一次，不会发送任何文档内容。",
          "English is built in. Other languages download once from {host}; no document content is sent.",
          { host: PACK_HOST_NAME },
        ),
      ),
      row(null),
      ...OCR_LANGUAGES.map(row),
      message,
      ...(apply ? [apply] : []),
    );
  }
  render();
  return root;
}
