import { choiceBox } from "./choice";
import { h } from "./dom";
import type { Choice, Gate } from "../source/privacy-gate";
import { t, type Lang } from "./strings";

export interface LockChipHandlers {
  /** The reader pressed the lock of a sensitive page. */
  onUnmark(): void;
  /** The reader answered the question about a page that looks private. */
  onChoose(choice: Choice, remember: boolean): void;
}

/** A small control on the page, shown only while the page is sensitive or would be asked about, so it can be settled before anything is selected. */
export class LockChip {
  readonly el = h("div", { className: "hb-lock", "data-hb": "lock-chip", hidden: true });
  private status: Gate = "normal";

  constructor(
    private readonly lang: Lang,
    private readonly handlers: LockChipHandlers,
  ) {}

  /** `byRule`: a site rule makes the page sensitive, which is not the lock's to change. */
  set(status: Gate, byRule = false): void {
    this.status = status;
    this.el.hidden = status === "normal";
    if (status === "normal") return void this.el.replaceChildren();
    const sensitive = status === "sensitive";
    const fixed = sensitive && byRule;
    this.el.replaceChildren(
      h(
        "button",
        {
          type: "button",
          className: "hb-quiet",
          "data-hb": "lock",
          disabled: fixed,
          onclick: () => (sensitive ? this.handlers.onUnmark() : this.openChoice()),
        },
        t(this.lang, fixed ? "lockRule" : sensitive ? "lockSensitive" : "lockAsk"),
      ),
    );
  }

  private openChoice(): void {
    if (this.status !== "ask" || this.el.querySelector('[data-hb="choice"]')) return;
    this.el.append(
      choiceBox(this.lang, (choice, remember) => {
        this.el.querySelector('[data-hb="choice"]')?.remove();
        this.handlers.onChoose(choice, remember);
      }),
    );
  }
}
