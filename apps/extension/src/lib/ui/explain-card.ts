import type { Tier } from "@harkback/spec";
import { h } from "../dom";
import { renderMarkdown } from "../markdown";
import type { ErrorCode } from "../messages";
import { errorText, t, type Lang } from "./strings";

export type CardAction = "marked_understood" | "marked_confused";

export interface ExplainCardHandlers {
  onAnswer(sameConcept: boolean): void;
  onAction(action: CardAction): void;
  onFollowUp(question: string): void;
  onMarkSensitive(): void;
  onRetry(): void;
  onClose(): void;
}

/** Failures where trying again can help; a partial explanation stays visible. */
const RETRYABLE = new Set<ErrorCode>(["timeout", "network", "http", "rate_limited", "internal"]);

// Buttons live in the extension's closed shadow root, which page scripts cannot reach,
// so their clicks come from the user; the page-level trigger checks isTrusted itself.
export class ExplainCard {
  readonly el: HTMLElement;
  private readonly meta = h("div", { className: "hb-meta" });
  private readonly body = h("div", { className: "hb-body", "data-hb": "explanation" });
  private readonly note = h("div", { className: "hb-note", "data-hb": "note" });
  private readonly footer = h("div", { className: "hb-footer" });
  private readonly followUp = h("div", { className: "hb-followup" });
  private readonly answer = h("div", { className: "hb-body hb-answer", "data-hb": "followup-answer" });
  private asking = false;
  private hasText = false;
  private closed = false;

  constructor(
    private readonly lang: Lang,
    private readonly handlers: ExplainCardHandlers,
  ) {
    this.body.textContent = t(lang, "loading");
    const close = h("button", { className: "hb-close", type: "button", "data-hb": "close", "aria-label": t(lang, "close"), onclick: () => this.close() }, "×");
    this.el = h("div", { className: "hb-card", "data-hb": "card", role: "dialog" }, close, this.meta, this.body, this.note, this.footer, this.followUp);
  }

  setStreaming(text: string): void {
    if (!text) return;
    this.hasText = true;
    this.render(this.body, text);
  }

  setExplained(text: string, tier: Tier): void {
    this.hasText = true;
    this.render(this.body, text);
    const label = t(this.lang, tier === "defined_in_source" ? "tierDefined" : "tierExternal");
    this.meta.replaceChildren(h("span", { className: `hb-tier hb-${tier}`, "data-hb": "tier" }, label));
  }

  ask(name: string, daysAgo: number): void {
    this.asking = true;
    const reply = (same: boolean) => {
      if (!this.asking) return;
      this.asking = false;
      this.footer.replaceChildren();
      this.handlers.onAnswer(same);
    };
    this.footer.replaceChildren(
      h(
        "div",
        { className: "hb-ask", "data-hb": "ask" },
        h("span", {}, t(this.lang, "askSame", { name, days: daysAgo })),
        h("button", { type: "button", "data-hb": "ask-yes", onclick: () => reply(true) }, t(this.lang, "yes")),
        h("button", { type: "button", "data-hb": "ask-no", onclick: () => reply(false) }, t(this.lang, "no")),
      ),
    );
  }

  done(recorded: boolean): void {
    if (!recorded) this.note.textContent = t(this.lang, "notRecorded");
    const choice = (hb: string, action: CardAction, key: "understood" | "confused") => {
      const button = h("button", { type: "button", "data-hb": hb, "data-choice": true, disabled: !recorded }, t(this.lang, key));
      button.addEventListener("click", () => {
        for (const b of this.footer.querySelectorAll<HTMLButtonElement>("button[data-choice]")) b.disabled = true;
        button.classList.add("hb-chosen");
        this.handlers.onAction(action);
      });
      return button;
    };
    const sensitive = h("button", { type: "button", "data-hb": "mark-sensitive", disabled: !recorded }, t(this.lang, "markSensitive"));
    sensitive.addEventListener("click", () => {
      sensitive.disabled = true;
      this.note.textContent = t(this.lang, "markedSensitive");
      this.handlers.onMarkSensitive();
    });
    this.footer.replaceChildren(
      choice("understood", "marked_understood", "understood"),
      choice("confused", "marked_confused", "confused"),
      h("button", { type: "button", "data-hb": "followup-open", onclick: () => this.openFollowUp() }, t(this.lang, "followUp")),
      sensitive,
    );
  }

  error(code: ErrorCode, retryAfterMs?: number): void {
    this.asking = false;
    const box = h("div", { className: "hb-error", "data-hb": "error" }, errorText(this.lang, code, retryAfterMs));
    if (this.hasText) this.note.replaceChildren(box);
    else this.body.replaceChildren(box);
    if (RETRYABLE.has(code)) {
      this.footer.replaceChildren(h("button", { type: "button", "data-hb": "retry", onclick: () => this.handlers.onRetry() }, t(this.lang, "retry")));
    }
  }

  followUpDelta(text: string): void {
    this.render(this.answer, text);
  }

  followUpDone(answer: string): void {
    this.render(this.answer, answer);
  }

  /** A failed follow-up only affects its answer; the recorded explanation keeps its actions. */
  followUpError(code: ErrorCode, retryAfterMs?: number): void {
    this.answer.replaceChildren(h("div", { className: "hb-error", "data-hb": "error" }, errorText(this.lang, code, retryAfterMs)));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.asking) {
      this.asking = false;
      this.handlers.onAnswer(false);
    }
    this.el.remove();
    this.handlers.onClose();
  }

  private openFollowUp(): void {
    if (this.followUp.childElementCount > 0) return;
    const input = h("input", { type: "text", "data-hb": "followup-input", maxlength: "2000", placeholder: t(this.lang, "followUpPlaceholder") });
    const send = () => {
      const question = input.value.trim();
      if (!question) return;
      input.value = "";
      this.answer.textContent = t(this.lang, "loading");
      this.handlers.onFollowUp(question);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
    const button = h("button", { type: "button", "data-hb": "followup-send", onclick: send }, t(this.lang, "send"));
    this.followUp.replaceChildren(h("div", { className: "hb-row" }, input, button), this.answer);
    input.focus();
  }

  private render(target: HTMLElement, text: string): void {
    target.replaceChildren(renderMarkdown(text));
    for (const link of target.querySelectorAll<HTMLElement>(".hb-link")) {
      const open = () => this.confirmLink(link.dataset.url ?? "");
      link.addEventListener("click", open);
      link.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    }
  }

  private confirmLink(url: string): void {
    if (!url) return;
    this.note.replaceChildren(
      h("span", { "data-hb": "link-confirm" }, t(this.lang, "openLink", { url })),
      " ",
      h("button", { type: "button", "data-hb": "link-open", onclick: () => window.open(url, "_blank", "noopener,noreferrer") }, t(this.lang, "openConfirm")),
    );
  }
}
