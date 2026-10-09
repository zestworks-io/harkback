type Child = Node | string | number | null | undefined | false;

/** Creates an element; string children are always inserted as text, never as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === "className") el.className = String(value);
    else if (key === "value") (el as unknown as HTMLInputElement).value = String(value);
    else if (key === "checked") (el as unknown as HTMLInputElement).checked = value === true;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "number" ? String(c) : c);
  }
  return el;
}
