import type { ConceptDetail } from "../records/concept-detail";
import type { Request, ResponseMap } from "../messaging/messages";
import { h } from "../ui/dom";
import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";

export interface SplitPanelDeps {
  detail: ConceptDetail;
  lang: Lang;
  split(req: Extract<Request, { type: "split-concept" }>): Promise<ResponseMap["split-concept"]>;
  /** Called with the new concept once the split is saved. */
  done(conceptId: string): void;
}

/**
 * Splits part of a concept off into a new one, for a look-up that was joined to the wrong concept: the reader picks the entries
 * and names that belong elsewhere and names the new concept.
 */
export function splitPanel({ detail: d, lang, split, done }: SplitPanelDeps): HTMLElement {
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  const entries = new Set<string>();
  const movedNames = new Set<string>();
  const status = h("p", { className: "note", "data-hb": "split-status", role: "status" });
  const newName = h("input", {
    type: "text",
    maxlength: "80",
    placeholder: L("新概念的名字", "Name of the new concept"),
    "aria-label": L("新概念的名字", "Name of the new concept"),
    "data-hb": "split-name",
  });
  let named = false;
  newName.addEventListener("input", () => {
    named = newName.value.trim() !== "";
    update();
  });
  const submit = h("button", { type: "button", "data-hb": "split-submit", disabled: true }, L("拆分出去", "Split off"));
  const update = (): void => {
    submit.disabled = !newName.value.trim() || (entries.size === 0 && movedNames.size === 0);
  };
  // Until the reader types a name, the new concept is called what was selected, or the first name moved.
  const suggest = (text: string): void => {
    if (named || newName.value.trim()) return;
    newName.value = text;
  };

  const option = (label: Node | string, hb: string, on: (checked: boolean) => void): HTMLElement => {
    const box = h("input", { type: "checkbox", "data-hb": hb });
    box.addEventListener("change", () => {
      on(box.checked);
      update();
    });
    return h("label", { className: "choice" }, box, label);
  };

  const entryOptions = d.entries.map((e) =>
    option(h("span", { dir: "auto" }, `“${e.selection}” · ${e.sourceTitle} · ${e.date}`), "split-entry", (on) => {
      if (on) {
        entries.add(e.encounterId);
        suggest(e.selection);
      } else entries.delete(e.encounterId);
    }),
  );
  const nameOptions = d.aliases.map((name) =>
    option(h("span", { dir: "auto" }, name), "split-alias", (on) => {
      if (on) {
        movedNames.add(name);
        suggest(name);
      } else movedNames.delete(name);
    }),
  );

  submit.addEventListener("click", async () => {
    submit.disabled = true;
    const r = await split({
      type: "split-concept",
      conceptId: d.conceptId,
      encounterIds: [...entries],
      names: [...movedNames],
      newName: newName.value,
    }).catch(() => ({ ok: false as const }));
    if (r.ok) {
      done(r.conceptId);
      return;
    }
    status.textContent =
      "rejoins" in r && r.rejoins
        ? L(
            "两边仍有相同的名字，拆开后会马上重新合并。把那个名字也移过去，或换一个新名字。",
            "Both would still share a name, which would join them again at once. Move that name too, or choose another name.",
          )
        : L("操作失败。", "That did not work.");
    update();
  });

  return h(
    "div",
    { className: "split-panel", "data-hb": "split-panel" },
    h("h3", {}, L("拆分这个概念", "Split this concept")),
    h(
      "p",
      { className: "note" },
      L(
        "选出属于另一个概念的查词记录和名字，它们会移到一个新概念。新名字若已是另一个概念的名字，就会并入那个概念。",
        "Pick the look-ups and names that belong to another concept; they move to a new concept. If the new name already belongs to another concept, they join that one.",
      ),
    ),
    entryOptions.length > 0 ? h("div", { className: "split-group" }, h("h4", {}, L("查词记录", "Look-ups")), ...entryOptions) : null,
    nameOptions.length > 0 ? h("div", { className: "split-group" }, h("h4", {}, L("名字", "Names")), ...nameOptions) : null,
    h("div", { className: "split-tools" }, newName, submit),
    status,
  );
}
