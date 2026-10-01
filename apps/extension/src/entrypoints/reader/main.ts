import "pdfjs-dist/web/pdf_viewer.css";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { browser } from "wxt/browser";
import { ContentApp } from "../../lib/content/app";
import { browserRpc } from "../../lib/content/rpc";
import { listenForTabMessages } from "../../lib/content/tab-messages";
import { takeHandoff } from "../../lib/pdf/handoff";
import { mountViewer } from "../../lib/pdf/viewer";
import { withDefaults } from "../../lib/settings";
import { detectPdfSource, type PdfFacts } from "../../lib/source-id";
import { pick } from "../../lib/ui/strings";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const FIRST_PAGE_CHARS = 6000;

class ReaderError extends Error {
  constructor(readonly kind: "file-access" | "download" | "password" | "invalid") {
    super(kind);
  }
}

/** `fetch` refuses file: URLs, but an extension that was allowed file access can read them with XHR. */
function readLocalFile(src: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", src);
    xhr.responseType = "arraybuffer";
    xhr.onload = () =>
      xhr.response instanceof ArrayBuffer && xhr.response.byteLength > 0
        ? resolve(new Uint8Array(xhr.response))
        : reject(new ReaderError("file-access"));
    xhr.onerror = () => reject(new ReaderError("file-access"));
    xhr.send();
  });
}

const LOCAL_FILES = "file:///*";

async function loadBytes(src: string, handoff: string | null): Promise<Uint8Array> {
  if (handoff) {
    const dataUrl = await takeHandoff(handoff).catch(() => null);
    if (dataUrl) return new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
  }
  if (src.startsWith("file:")) return readLocalFile(src);
  try {
    const res = await fetch(src, { credentials: "include" });
    if (!res.ok) throw new ReaderError("download");
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    throw e instanceof ReaderError ? e : new ReaderError(src.startsWith("file:") ? "file-access" : "download");
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  const settings = withDefaults((await browser.storage.local.get("settings")).settings);
  const L = (zh: string, en: string) => pick(settings.language, zh, en);
  const notice = document.getElementById("notice")!;
  const host = document.getElementById("pages")!;
  const say = (title: string, ...lines: string[]) => {
    const h = Object.assign(document.createElement("h1"), { textContent: title });
    notice.replaceChildren(h, ...lines.map((l) => Object.assign(document.createElement("p"), { textContent: l })));
    notice.hidden = false;
  };

  const params = new URL(location.href).searchParams;
  const src = params.get("src") ?? "";
  if (!/^(https?|file):/i.test(src)) return say(L("没有指定要打开的 PDF。", "No PDF was given to open."));

  const assets = new URL("pdfjs/", browser.runtime.getURL("/reader.html")).href;
  let doc: pdfjs.PDFDocumentProxy;
  let hash: string | undefined;
  try {
    const bytes = await loadBytes(src, params.get("h"));
    if (src.startsWith("file:")) hash = await sha256Hex(bytes);
    doc = await pdfjs.getDocument({
      data: bytes,
      cMapUrl: `${assets}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
      iccUrl: `${assets}iccs/`,
    }).promise;
  } catch (e) {
    const kind = e instanceof ReaderError ? e.kind : (e as { name?: string }).name === "PasswordException" ? "password" : "invalid";
    if (kind === "file-access") {
      if (await browser.permissions.contains({ origins: [LOCAL_FILES] })) {
        say(
          L("无法读取这个本地文件", "Cannot read this local file"),
          L(
            "请在 chrome://extensions 中打开 Harkback 的详情，开启「允许访问文件网址」，然后再点一次工具栏按钮。",
            'Open Harkback\'s details in chrome://extensions, turn on "Allow access to file URLs", then click the toolbar button again.',
          ),
        );
        return;
      }
      say(
        L("需要读取本地文件的权限", "Harkback needs access to local files"),
        L(
          "这个 PDF 在你的电脑上。允许后，Harkback 才能读取它来标注术语；文件不会被上传。",
          "This PDF is on your computer. Allow access so Harkback can read it and mark terms. The file is never uploaded.",
        ),
      );
      const allow = Object.assign(document.createElement("button"), {
        type: "button",
        textContent: L("允许读取本地文件", "Allow local files"),
      });
      allow.onclick = () => {
        allow.disabled = true;
        void browser.permissions.request({ origins: [LOCAL_FILES] }).then((ok) => (ok ? location.reload() : (allow.disabled = false)));
      };
      const actions = Object.assign(document.createElement("div"), { className: "actions" });
      actions.append(allow);
      notice.append(actions);
      return;
    }
    if (kind === "download") {
      return say(
        L("无法下载这个 PDF。", "Could not download this PDF."),
        L("请回到原来的页面，再点一次工具栏按钮。", "Go back to the original page and click the toolbar button again."),
      );
    }
    if (kind === "password")
      return say(L("这个 PDF 有密码保护，无法读取其中的文字。", "This PDF is password protected, so its text cannot be read."));
    return say(L("无法打开这个 PDF 文件。", "This PDF file could not be opened."));
  }

  const meta = await doc.getMetadata().catch(() => null);
  const info = (meta?.info ?? {}) as { Title?: string };
  const xmp = meta?.metadata as { get(name: string): string | null } | null | undefined;
  const metadataDoi = xmp?.get("prism:doi") ?? xmp?.get("crossmark:DOI") ?? undefined;
  const firstText = await doc
    .getPage(1)
    .then((p) => p.getTextContent())
    .then((c) => c.items.map((i) => ("str" in i ? i.str : "")).join(" "))
    .catch(() => "");
  const facts: PdfFacts = {
    url: src,
    title: info.Title ?? "",
    firstPageText: firstText.slice(0, FIRST_PAGE_CHARS),
    ...(metadataDoi ? { metadataDoi } : {}),
    ...(hash ? { contentHash: hash } : {}),
  };
  const source = detectPdfSource(facts);
  document.title = source.title ? `${source.title} · Harkback` : "Harkback · PDF";

  const app = new ContentApp(browserRpc, import.meta.env.MODE === "e2e" ? "open" : "closed", {
    url: src,
    detect: () => source,
    root: () => host,
  });
  listenForTabMessages(app);
  const viewer = await mountViewer(doc, host, { onTextChanged: () => app.invalidate() });
  // Opening the reader is the same request as pressing the button on a web page.
  void app.activate().catch(() => undefined);
  void viewer.textReady.then((chars) => {
    if (chars === 0) {
      say(
        L(
          "这个 PDF 没有可选中的文字，可能是扫描件；Harkback 无法解释其中的内容。",
          "This PDF has no selectable text, so it may be a scan; Harkback cannot explain what is in it.",
        ),
      );
    }
  });
}

void main();
