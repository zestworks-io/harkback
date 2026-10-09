import { findCandidates, type State } from "@harkback/core";
import { understandingOf } from "./concept-detail";
import { applySiteRules } from "./explain";
import type { ErrorCode } from "./messages";
import { chooseModel } from "./model-policy";
import { dueAtOf } from "./review";
import type { ModelConfig, Settings } from "./settings";
import { effectiveRule } from "./site-rules";

/** How a term on a page stands with this reader: `rusty` is shaky or due for review, `new` was never looked up. */
export type PreviewStatus = "confused" | "rusty" | "understood" | "new";

export interface PreviewTerm {
  /** The term as the page uses it. */
  term: string;
  /** Set for a term the reader has looked up. */
  conceptId: string | null;
  name: string;
  status: PreviewStatus;
}

/** Only a name the reader already has counts as a match; a merely similar one is a different term. */
const MATCH_SCORE = 0.95;

/** Sorts the terms of a page by what the reader knows. A concept is listed once, and muted ones are left out. */
export function classifyTerms(state: State, terms: readonly string[], now: number): PreviewTerm[] {
  const seen = new Set<string>();
  const out: PreviewTerm[] = [];
  for (const term of terms) {
    const best = findCandidates(state, term, 1, MATCH_SCORE)[0];
    if (!best || best.isPlaceholder) {
      out.push({ term, conceptId: null, name: term, status: "new" });
      continue;
    }
    const id = state.representative.get(best.conceptId) ?? best.conceptId;
    const concept = state.concepts.get(id);
    if (!concept || concept.muted || seen.has(id)) continue;
    seen.add(id);
    const understanding = understandingOf(state, id);
    const due = dueAtOf(state, id);
    const status: PreviewStatus =
      understanding === "confused" ? "confused" : understanding === "shaky" || (due !== null && due <= now) ? "rusty" : "understood";
    out.push({ term, conceptId: id, name: concept.canonicalName, status });
  }
  return out;
}

/** The latest explanation the reader was given for a concept, or null when there is none. */
export function storedExplanation(state: State, conceptId: string): string | null {
  const id = state.representative.get(conceptId) ?? conceptId;
  if (!state.concepts.get(id) || state.concepts.get(id)!.isPlaceholder) return null;
  const latest = state.encounters.get(state.encountersByConcept.get(id)?.at(-1) ?? "");
  return latest?.explanation.text ?? null;
}

export type PreviewRoute = { kind: "ok"; model: ModelConfig; remote: boolean; sensitive: boolean } | { kind: "error"; code: ErrorCode };

/**
 * Where a page scan would go, without sending anything: the model the settings choose for this page. A page that is
 * sensitive, by site rule or because it was marked, only ever goes to a local model, as an explanation would.
 */
export function routePreview(settings: Settings, recorded: State, url: string, sourceId: string): PreviewRoute {
  const rule = effectiveRule(settings.sites, url);
  if (rule.disabled) return { kind: "error", code: "site_disabled" };
  const state = applySiteRules(recorded, settings.sites);
  const sensitive = rule.sensitive || state.sources.get(sourceId)?.sensitivity === "sensitive";
  const chosen = chooseModel(settings, rule, sensitive);
  if (chosen.kind === "error") return { kind: "error", code: chosen.code };
  return { kind: "ok", model: chosen.model, remote: chosen.remote, sensitive };
}
