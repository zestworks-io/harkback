import type { State } from "@harkback/core";
import { conceptDetail, type ConceptDetail, type RelatedConcept } from "./concept-detail";
import type { Lang } from "./ui/strings";

const MAX_TITLE = 120;
const UNSAFE_IN_FILENAME = /[\\/:*?"<>|]/g;
const UNSAFE_IN_LINK = /[[\]|#^]/g;
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A name that works both as a file name and inside a wiki link, so `[[Name]]` finds `Name.md`. */
export function noteTitle(name: string): string {
  const title = name
    .replace(UNSAFE_IN_FILENAME, " ")
    .replace(UNSAFE_IN_LINK, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  const bounded = (title || "concept").slice(0, MAX_TITLE).replace(/[. ]+$/, "");
  return RESERVED_ON_WINDOWS.test(bounded) ? `${bounded}_` : bounded;
}

export function noteFilename(name: string): string {
  return `${noteTitle(name)}.md`;
}

/** Everything below this line in a note is the reader's own; exporting again never touches it. */
export const NOTE_END = "<!-- harkback:end — write below this line; it is kept when notes are exported again -->";

const TEXT = {
  zh: {
    prerequisites: "前置概念",
    variants: "变体",
    related: "相关",
    timeline: "记录",
    tier: { defined_in_source: "原文定义", external_knowledge: "外部知识" },
    source: (t: string) => `《${t}》`,
  },
  en: {
    prerequisites: "Prerequisites",
    variants: "Variants",
    related: "Related",
    timeline: "Timeline",
    tier: { defined_in_source: "Defined in source", external_knowledge: "External knowledge" },
    source: (t: string) => `“${t}”`,
  },
} as const;

const PLAIN = /^[\p{L}\p{N} ._()-]+$/u;
/** Quoted unless plain text could be read as a list item, number, boolean or null. */
const YAML_SCALAR = /^([-.\d]|(true|false|yes|no|on|off|null|y|n)$)/i;
const yaml = (s: string): string => (PLAIN.test(s) && !YAML_SCALAR.test(s) ? s : JSON.stringify(s));

type TitleOf = (concept: Pick<RelatedConcept, "conceptId" | "name">) => string;

const links = (heading: string, items: RelatedConcept[], titleOf: TitleOf): string[] =>
  items.length === 0 ? [] : [`## ${heading}`, ...items.map((r) => `- [[${titleOf(r)}]]`), ""];

/** One Markdown note per concept, with `[[wiki links]]` to the concepts it connects to (Obsidian and similar tools). */
export function conceptNote(d: ConceptDetail, language: Lang, titleOf: TitleOf = (c) => noteTitle(c.name)): string {
  // Notes are portable files: languages without a table of their own get English headings.
  const t = TEXT[language === "zh" ? "zh" : "en"];
  const lines = ["---"];
  if (d.aliases.length > 0) lines.push("aliases:", ...d.aliases.map((a) => `  - ${yaml(a)}`));
  lines.push(`domain: ${d.domain}`, `status: ${d.understanding}`, "---", "", `# ${d.name}`, "");
  lines.push(
    ...links(t.prerequisites, d.prerequisites, titleOf),
    ...links(t.variants, d.variants, titleOf),
    ...links(t.related, d.related, titleOf),
  );
  lines.push(`## ${t.timeline}`);
  for (const e of d.entries) {
    lines.push(`- ${e.date} · ${t.source(e.sourceTitle)} · ${t.tier[e.tier]}`);
    lines.push(`  > ${e.explanation.replace(/\s*\n\s*/g, " ").trim()}`);
  }
  lines.push("", NOTE_END, "");
  return lines.join("\n");
}

/** The note as it is after an export: new generated text, plus whatever the reader wrote below the marker of the old file. */
export function mergeNote(generated: string, existing: string | null): string {
  if (existing === null) return generated;
  const at = existing.indexOf(NOTE_END);
  if (at < 0) return generated;
  const mine = existing.slice(at + NOTE_END.length).replace(/^\r?\n/, "");
  return mine.trim() ? `${generated}${mine}` : generated;
}

/** Every studied concept as a note; two concepts that would share a file name get " (2)", " (3)" ... */
export function noteFiles(state: State, language: Lang): { filename: string; content: string }[] {
  const details = [...state.concepts.keys()]
    .map((id) => conceptDetail(state, id))
    .filter((d): d is ConceptDetail => d !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.conceptId.localeCompare(b.conceptId));
  const titles = new Map<string, string>();
  const taken = new Set<string>();
  for (const d of details) {
    const base = noteTitle(d.name);
    let title = base;
    for (let n = 2; taken.has(title.toLowerCase()); n++) title = `${base} (${n})`;
    taken.add(title.toLowerCase());
    titles.set(d.conceptId, title);
  }
  const titleOf: TitleOf = (c) => titles.get(c.conceptId) ?? noteTitle(c.name);
  return details.map((d) => ({ filename: `${titles.get(d.conceptId)!}.md`, content: conceptNote(d, language, titleOf) }));
}

/** Where the notes go inside the folder the reader picked, so nothing outside it is ever touched. */
export const NOTES_FOLDER = "Harkback";

export interface NoteWriteResult {
  written: number;
  failed: string[];
}

async function readText(handle: FileSystemFileHandle): Promise<string | null> {
  try {
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/** Writes each note into `<dir>/Harkback/`; one failing file does not stop the rest. */
export async function writeNoteFiles(
  dir: FileSystemDirectoryHandle,
  files: { filename: string; content: string }[],
): Promise<NoteWriteResult> {
  const target = await dir.getDirectoryHandle(NOTES_FOLDER, { create: true });
  const result: NoteWriteResult = { written: 0, failed: [] };
  for (const f of files) {
    try {
      const handle = await target.getFileHandle(f.filename, { create: true });
      const existing = await readText(handle);
      const writable = await handle.createWritable();
      await writable.write(mergeNote(f.content, existing || null));
      await writable.close();
      result.written++;
    } catch {
      result.failed.push(f.filename);
    }
  }
  return result;
}
