import { h } from "../ui/dom";

export function input(value: string, onInput: (v: string) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const el = h("input", { type: "text", value, ...attrs });
  el.addEventListener("input", () => onInput(el.value));
  return el;
}

export function numberInput(value: number, onInput: (v: number) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const el = h("input", { type: "number", value: String(value), ...attrs });
  el.addEventListener("input", () => onInput(Number(el.value)));
  return el;
}

export function checkbox(checked: boolean, onChange: (v: boolean) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const el = h("input", { type: "checkbox", checked, ...attrs });
  el.addEventListener("change", () => onChange(el.checked));
  return el;
}

/** A checkbox with a third state: left alone (inherits from a broader rule), on, or explicitly off. */
export function triState(
  value: boolean | undefined,
  onChange: (v: boolean | undefined) => void,
  title: string,
  attrs: Record<string, unknown> = {},
) {
  let current = value;
  const el = h("input", { type: "checkbox", title, ...attrs });
  const paint = () => {
    el.indeterminate = current === undefined;
    el.checked = current === true;
  };
  paint();
  el.addEventListener("click", () => {
    current = current === undefined ? true : current === true ? false : undefined;
    onChange(current);
    paint();
  });
  return el;
}

export const field = (label: string, control: HTMLElement, cls = ""): HTMLElement =>
  h("label", { className: `field ${cls}`.trim() }, h("span", {}, label), control);

export const choice = (control: HTMLElement, label: string): HTMLElement => h("label", { className: "choice" }, control, label);

/** A settings card: a title, an optional description, its controls and an optional footer of buttons. */
export const card = (title: string, desc: string | null, body: (Node | null)[], foot: Node[] = []): HTMLElement =>
  h(
    "section",
    { className: "card" },
    h("div", { className: "card-head" }, h("h2", {}, title), desc ? h("p", {}, desc) : null),
    h("div", { className: "card-body" }, ...body),
    foot.length > 0 ? h("div", { className: "card-foot" }, ...foot) : null,
  );
