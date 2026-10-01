import { h } from "../dom";

/** A password input with a button that reveals the value, so a pasted key can be checked. */
export function secretInput(
  input: HTMLInputElement,
  labels: { show: string; hide: string },
): HTMLDivElement {
  const toggle = h("button", { type: "button", className: "reveal", "aria-pressed": "false" }, labels.show);
  toggle.addEventListener("click", () => {
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    toggle.textContent = reveal ? labels.hide : labels.show;
    toggle.setAttribute("aria-pressed", String(reveal));
  });
  return h("div", { className: "secret" }, input, toggle);
}
