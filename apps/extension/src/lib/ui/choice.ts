import { h } from "./dom";
import type { Choice } from "../source/privacy-gate";
import { t, type Lang } from "./strings";

/** The question for a page that looks private. Nothing has been sent; the answer is given once. */
export function choiceBox(lang: Lang, onChoose: (choice: Choice, remember: boolean) => void): HTMLElement {
  const remember = h("input", { type: "checkbox", "data-hb": "choose-remember" }) as HTMLInputElement;
  const box = h("div", { className: "hb-choice", "data-hb": "choice" });
  const answer = (choice: Choice) => () => {
    for (const b of box.querySelectorAll<HTMLButtonElement>("button")) b.disabled = true;
    onChoose(choice, remember.checked);
  };
  box.append(
    h("p", {}, t(lang, "choiceTitle")),
    h("label", {}, remember, t(lang, "choiceRemember")),
    h(
      "div",
      { className: "hb-actions" },
      h("button", { type: "button", className: "hb-primary", "data-hb": "choose-local", onclick: answer("local") }, t(lang, "choiceLocal")),
      h("button", { type: "button", "data-hb": "choose-anyway", onclick: answer("anyway") }, t(lang, "choiceAnyway")),
    ),
  );
  return box;
}
