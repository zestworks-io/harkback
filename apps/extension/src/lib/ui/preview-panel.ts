import { h } from "./dom";
import type { ErrorCode, ResponseMap } from "../messaging/messages";
import type { PreviewStatus, PreviewTerm } from "../explain/preview";
import { errorText, t, type Lang, type StringKey } from "./strings";

export interface PreviewHandlers {
  onScan(): void;
  /** The reader's own explanation for a known term, or a model's for a new one. */
  onExplain(term: PreviewTerm): Promise<ResponseMap["preview-explain"]>;
  onClose(): void;
}

const GROUPS: { status: PreviewStatus; title: StringKey }[] = [
  { status: "confused", title: "previewConfused" },
  { status: "rusty", title: "previewRusty" },
  { status: "new", title: "previewNew" },
  { status: "understood", title: "previewUnderstood" },
];

/** What a reader sees before reading: the terms of the page sorted by how well they know them. Nothing here is recorded. */
export class PreviewPanel {
  readonly el: HTMLElement;
  private readonly body = h("div", { className: "hb-body" });
  private readonly footer = h("div", { className: "hb-footer" });

  constructor(
    private readonly lang: Lang,
    private readonly handlers: PreviewHandlers,
  ) {
    const close = h(
      "button",
      { className: "hb-close", type: "button", "data-hb": "close", "aria-label": t(lang, "close"), onclick: () => this.handlers.onClose() },
      "×",
    );
    this.el = h(
      "div",
      { className: "hb-card hb-preview", "data-hb": "preview", role: "dialog" },
      close,
      h("div", { className: "hb-head" }, h("strong", {}, t(lang, "previewTitle"))),
      h("div", { className: "hb-scroll" }, this.body),
      h("div", { className: "hb-compose" }, this.footer),
    );
  }

  /** The invitation: nothing is sent until the reader presses Scan. It says which model would read the page, and whether it is remote. */
  offer(plan: { model: string; remote: boolean }): void {
    this.body.className = "hb-body";
    this.body.replaceChildren(
      h("p", { "data-hb": "preview-ask" }, t(this.lang, "previewAsk")),
      h(
        "p",
        { className: "hb-note", "data-hb": "preview-where", "data-remote": String(plan.remote) },
        t(this.lang, plan.remote ? "previewRemote" : "previewLocal", { model: plan.model }),
      ),
    );
    this.footer.replaceChildren(
      h(
        "button",
        { type: "button", className: "hb-primary", "data-hb": "preview-scan", onclick: () => this.handlers.onScan() },
        t(this.lang, "previewScan"),
      ),
      h("button", { type: "button", className: "hb-quiet", onclick: () => this.handlers.onClose() }, t(this.lang, "close")),
    );
  }

  /** No scan is possible (no model, a disabled site, a sensitive page without a local model): the reason, and nothing to press. */
  unavailable(code: ErrorCode, retryAfterMs?: number): void {
    this.body.className = "hb-body";
    this.body.replaceChildren(h("div", { className: "hb-error", "data-hb": "error" }, errorText(this.lang, code, retryAfterMs)));
    this.footer.replaceChildren(
      h("button", { type: "button", className: "hb-quiet", onclick: () => this.handlers.onClose() }, t(this.lang, "close")),
    );
  }

  scanning(): void {
    this.body.className = "hb-body hb-loading";
    this.body.replaceChildren(t(this.lang, "previewScanning"));
    this.footer.replaceChildren();
  }

  error(code: ErrorCode, retryAfterMs?: number): void {
    this.body.className = "hb-body";
    this.body.replaceChildren(h("div", { className: "hb-error", "data-hb": "error" }, errorText(this.lang, code, retryAfterMs)));
    this.footer.replaceChildren(
      h(
        "button",
        { type: "button", className: "hb-primary", "data-hb": "preview-scan", onclick: () => this.handlers.onScan() },
        t(this.lang, "retry"),
      ),
    );
  }

  /** `note` says what the scan did not cover, when anything. */
  show(terms: readonly PreviewTerm[], note = ""): void {
    this.body.className = "hb-body";
    this.footer.replaceChildren();
    const groups = GROUPS.flatMap(({ status, title }) => {
      const items = terms.filter((x) => x.status === status);
      if (items.length === 0) return [];
      const rows = items.map((x) => this.row(x));
      const head = `${t(this.lang, title)} · ${items.length}`;
      // What the reader already knows is not what they need to look at first.
      return status === "understood"
        ? [h("details", { className: "hb-group", "data-hb": "preview-group", "data-status": status }, h("summary", {}, head), ...rows)]
        : [h("section", { className: "hb-group", "data-hb": "preview-group", "data-status": status }, h("h3", {}, head), ...rows)];
    });
    this.body.replaceChildren(...groups, ...(note ? [h("p", { className: "hb-note", "data-hb": "preview-note" }, note)] : []));
  }

  private row(term: PreviewTerm): HTMLElement {
    const detail = h("div", { className: "hb-detail" });
    let loaded = false;
    const button = h("button", { type: "button", className: "hb-quiet", "data-hb": "preview-open" }, t(this.lang, "previewShow"));
    button.addEventListener("click", () => {
      if (loaded) {
        detail.hidden = !detail.hidden;
        return;
      }
      loaded = true;
      button.disabled = true;
      detail.textContent = t(this.lang, "previewWorking");
      void this.handlers.onExplain(term).then(
        (r) => {
          button.disabled = false;
          if (r.ok) {
            detail.replaceChildren(
              h("div", { "data-hb": "preview-text" }, r.explanation),
              h("div", { className: "hb-note" }, t(this.lang, r.stored ? "previewStored" : "previewGenerated")),
            );
          } else {
            loaded = false;
            detail.replaceChildren(h("div", { className: "hb-error" }, errorText(this.lang, r.code, r.retryAfterMs)));
          }
        },
        () => {
          loaded = false;
          button.disabled = false;
          detail.replaceChildren(h("div", { className: "hb-error" }, errorText(this.lang, "internal")));
        },
      );
    });
    return h(
      "div",
      { className: "hb-term", "data-hb": "preview-term", "data-status": term.status },
      h("div", { className: "hb-term-line" }, h("span", { className: "hb-term-name" }, term.name), button),
      detail,
    );
  }

  close(): void {
    this.el.remove();
  }
}
