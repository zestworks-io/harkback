import type { State } from "@harkback/core";
import { understandingOf } from "../records/concept-detail";

// Quotes too: a field that starts with one would be read as a quoted field by the importer.
const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const field = (s: string): string => escapeHtml(s).replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
const tag = (s: string): string => s.replace(/[\s,]+/g, "_");

/**
 * One flashcard per studied concept, as the tab-separated text Anki imports: the name (with other names) on the front, the
 * latest explanation, the quote it came from and the source on the back. Muted concepts are left out.
 * Pass the state without sensitive sources to keep those out of the file.
 */
export function ankiTsv(state: State): string {
  const rows: string[] = ["#separator:tab", "#html:true", "#tags column:3"];
  const concepts = [...state.concepts.values()]
    .filter((c) => !c.isPlaceholder && !c.muted)
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "en"));
  for (const c of concepts) {
    const latest = state.encounters.get(state.encountersByConcept.get(c.id)?.at(-1) ?? "");
    if (!latest) continue;
    const others = c.names.filter((n) => n !== c.canonicalName);
    const front = `<b>${field(c.canonicalName)}</b>${others.length > 0 ? `<br><small>${field(others.join(" · "))}</small>` : ""}`;
    const source = state.sources.get(latest.sourceId)?.title || latest.sourceId;
    const back = `${field(latest.explanation.text)}<br><br><i>“${field(latest.selection)}” — ${field(source)}</i>`;
    rows.push([front, back, `harkback ${c.domain} ${understandingOf(state, c.id)}`.split(" ").map(tag).join(" ")].join("\t"));
  }
  return `${rows.join("\n")}\n`;
}
