/**
 * YouTube draws its captions so that they cannot be selected (`user-select: none` all the way up), lets a drag move the caption
 * window, and treats a click on the player as play or pause and a double click as full screen. So the reader could not select a
 * term to explain it, and trying either moved the captions or started the video again.
 *
 * While the video is paused this lets the captions be selected and keeps those mouse events from reaching the player. The
 * extension's own listeners sit on the document in the capture phase, so they run before this and still see every event.
 * While the video plays nothing changes: the captions can still be dragged and a click still pauses.
 */

/** Set on the caption window while its text can be selected. */
export const SELECTABLE = "data-hb-selectable";
const STYLE_ID = "hb-caption-select";
const EVENTS = ["pointerdown", "mousedown", "mouseup", "click", "dblclick"] as const;

function ensureStyle(doc: Document, windowSelector: string): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${windowSelector}[${SELECTABLE}], ${windowSelector}[${SELECTABLE}] * { -webkit-user-select: text !important; user-select: text !important; cursor: text !important; }`;
  (doc.head ?? doc.documentElement).append(style);
}

/** Makes the captions in `container` selectable while `isPaused()` is true. Returns a function that undoes it. */
export function allowCaptionSelection(doc: Document, container: Element, windowSelector: string, isPaused: () => boolean): () => void {
  ensureStyle(doc, windowSelector);
  const stop = (e: Event): void => {
    if (isPaused()) e.stopPropagation();
  };
  for (const type of EVENTS) container.addEventListener(type, stop, true);
  return () => {
    for (const type of EVENTS) container.removeEventListener(type, stop, true);
    container.removeAttribute(SELECTABLE);
  };
}

/** Marks the window as selectable or not; called when the video is paused or played. */
export function setSelectable(container: Element | null, selectable: boolean): void {
  if (selectable) container?.setAttribute(SELECTABLE, "");
  else container?.removeAttribute(SELECTABLE);
}
