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
  /** Earlier follow-up questions and their answers; scrolls with the card. */
  private readonly thread = h("div", { className: "hb-thread" });
  /** The question box and Send button stay pinned below the scrolling part of the card. */
  private readonly compose = h("div", { className: "hb-compose" });
  private answer: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private asking = false;
  private hasText = false;
  private closed = false;

  constructor(
    private readonly lang: Lang,
    private readonly handlers: ExplainCardHandlers,
  ) {
    this.body.textContent = t(lang, "loading");
    this.body.classList.add("hb-loading");
    const close = h(
      "button",
      { className: "hb-close", type: "button", "data-hb": "close", "aria-label": t(lang, "close"), onclick: () => this.close() },
      "×",
    );
    this.el = h(
      "div",
      { className: "hb-card", "data-hb": "card", role: "dialog" },
      close,
      h("div", { className: "hb-scroll" }, this.meta, this.body, this.note, this.footer, this.thread),
      this.compose,
    );
    document.addEventListener("keydown", this.onKeyDown, true);
  }

  setStreaming(text: string): void {
    if (!text) return;
    this.hasText = true;
    this.body.classList.remove("hb-loading");
    this.render(this.body, text);
  }

  setExplained(text: string, tier: Tier): void {
    this.hasText = true;
    this.body.classList.remove("hb-loading");
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
        h("button", { type: "button", className: "hb-primary", "data-hb": "ask-yes", onclick: () => reply(true) }, t(this.lang, "yes")),
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
    const sensitive = h(
      "button",
      { type: "button", className: "hb-quiet", "data-hb": "mark-sensitive", disabled: !recorded },
      t(this.lang, "markSensitive"),
    );
    sensitive.addEventListener("click", () => {
      sensitive.disabled = true;
      this.note.textContent = t(this.lang, "markedSensitive");
      this.handlers.onMarkSensitive();
    });
    this.footer.replaceChildren(
      choice("understood", "marked_understood", "understood"),
      choice("confused", "marked_confused", "confused"),
      h("span", { className: "hb-spacer" }),
      h(
        "button",
        { type: "button", className: "hb-quiet", "data-hb": "followup-open", onclick: () => this.openFollowUp() },
        t(this.lang, "followUp"),
      ),
      sensitive,
    );
  }

  error(code: ErrorCode, retryAfterMs?: number): void {
    this.asking = false;
    const box = h("div", { className: "hb-error", "data-hb": "error" }, errorText(this.lang, code, retryAfterMs));
    if (this.hasText) this.note.replaceChildren(box);
    else this.body.replaceChildren(box);
    if (RETRYABLE.has(code)) {
      this.footer.replaceChildren(
        h(
          "button",
          { type: "button", className: "hb-primary", "data-hb": "retry", onclick: () => this.handlers.onRetry() },
          t(this.lang, "retry"),
        ),
      );
    }
  }

  followUpDelta(text: string): void {
    const stick = this.nearBottom();
    this.render(this.currentAnswer(), text);
    if (stick) this.scrollToEnd();
  }

  followUpDone(answer: string): void {
    this.render(this.currentAnswer(), answer);
    this.setPending(false);
  }

  /** A failed follow-up only affects its answer; the recorded explanation keeps its actions. */
  followUpError(code: ErrorCode, retryAfterMs?: number): void {
    this.currentAnswer().replaceChildren(h("div", { className: "hb-error", "data-hb": "error" }, errorText(this.lang, code, retryAfterMs)));
    this.setPending(false);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener("keydown", this.onKeyDown, true);
    if (this.asking) {
      this.asking = false;
      this.handlers.onAnswer(false);
    }
    this.el.remove();
    this.handlers.onClose();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && e.isTrusted) this.close();
  };

  private openFollowUp(): void {
    if (this.compose.childElementCount > 0) return;
    const input = h("input", {
      type: "text",
      "data-hb": "followup-input",
      maxlength: "2000",
      placeholder: t(this.lang, "followUpPlaceholder"),
    });
    const send = () => {
      const question = input.value.trim();
      if (!question || this.pending) return;
      input.value = "";
      this.thread.append(h("div", { className: "hb-question", "data-hb": "followup-question" }, question));
      this.startAnswer().textContent = t(this.lang, "loading");
      this.setPending(true);
      this.scrollToEnd();
      this.handlers.onFollowUp(question);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) send();
    });
    const button = h(
      "button",
      { type: "button", className: "hb-primary", "data-hb": "followup-send", onclick: send },
      t(this.lang, "send"),
    );
    this.input = input;
    this.sendButton = button;
    this.compose.replaceChildren(h("div", { className: "hb-row" }, input, button));
    input.focus();
  }

  private pending = false;

  /** One question at a time: the service handles a single follow-up, so a second one would be dropped and the old answer would stay. */
  private setPending(pending: boolean): void {
    this.pending = pending;
    if (this.sendButton) this.sendButton.disabled = pending;
    if (this.input) {
      this.input.readOnly = pending;
      if (!pending) this.input.focus();
    }
  }

  /** A new answer block below its question; only the latest one carries the `followup-answer` hook. */
  private startAnswer(): HTMLElement {
    this.answer?.removeAttribute("data-hb");
    this.answer = h("div", { className: "hb-body hb-answer", "data-hb": "followup-answer" });
    this.thread.append(this.answer);
    return this.answer;
  }

  private currentAnswer(): HTMLElement {
    return this.answer ?? this.startAnswer();
  }

  private scroller(): HTMLElement | null {
    return this.el.querySelector<HTMLElement>(".hb-scroll");
  }

  private nearBottom(): boolean {
    const s = this.scroller();
    return !s || s.scrollHeight - s.scrollTop - s.clientHeight < 48;
  }

  private scrollToEnd(): void {
    const s = this.scroller();
    if (s) s.scrollTop = s.scrollHeight;
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
      h(
        "button",
        { type: "button", "data-hb": "link-open", onclick: () => window.open(url, "_blank", "noopener,noreferrer") },
        t(this.lang, "openConfirm"),
      ),
    );
  }
}
