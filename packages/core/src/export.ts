import { LIMITS, parseEvent, utf8Length, type HarkEvent } from "@harkback/spec";
import type { State } from "./state";

export function serializeJsonl(events: readonly HarkEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + (events.length > 0 ? "\n" : "");
}

export interface JsonlParseResult {
  events: HarkEvent[];
  future: unknown[];
  skipped: { line: number; reason: string }[];
}

export function parseJsonl(text: string): JsonlParseResult {
  const result: JsonlParseResult = { events: [], future: [], skipped: [] };
  const lines = text.split("\n");
  const lastIndex = text.endsWith("\n") ? -1 : lines.length - 1;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const lineNo = i + 1;
    if (utf8Length(line) > LIMITS.maxEventBytes) {
      result.skipped.push({ line: lineNo, reason: "too_large" });
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      result.skipped.push({ line: lineNo, reason: i === lastIndex ? "partial" : "invalid_json" });
      return;
    }
    const parsed = parseEvent(raw);
    if (parsed.kind === "event") result.events.push(parsed.event);
    else if (parsed.kind === "future") result.future.push(parsed.raw);
    else result.skipped.push({ line: lineNo, reason: parsed.reason });
  });
  return result;
}

const TIER_LABEL = {
  zh: { defined_in_source: "原文定义", external_knowledge: "外部知识" },
  en: { defined_in_source: "Defined in source", external_knowledge: "External knowledge" },
} as const;

/** `language` is an interface language code; anything but "zh" is exported with English labels. */
export function exportMarkdown(state: State, language = "en"): string {
  const labels = language === "zh" ? "zh" : "en";
  const lines = ["# Harkback export", ""];
  const concepts = [...state.concepts.values()]
    .filter((c) => !c.isPlaceholder)
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "en"));
  for (const c of concepts) {
    lines.push(`## ${c.canonicalName}`);
    const aliases = c.names.filter((n) => n !== c.canonicalName);
    lines.push(`*${c.domain}${aliases.length ? ` · ${aliases.join(", ")}` : ""}*`, "");
    for (const eid of state.encountersByConcept.get(c.id) ?? []) {
      const e = state.encounters.get(eid)!;
      const title = state.sources.get(e.sourceId)?.title || e.sourceId;
      const date = new Date(e.createdAt).toISOString().slice(0, 10);
      const source = labels === "zh" ? `《${title}》` : `“${title}”`;
      lines.push(`- ${date} · ${source} · ${TIER_LABEL[labels][e.explanation.tier]}`);
      lines.push(`  > ${e.explanation.text.replace(/\s*\n\s*/g, " ").slice(0, 500)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
