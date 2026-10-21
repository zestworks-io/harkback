import { isSensitiveSource, type State } from "@harkback/core";
import { CARD_LIMITS, LIMITS, utf8Length, type Explanation } from "@harkback/spec";
import type { ErrorCode } from "../messaging/messages";
import { chooseModel } from "../models/model-policy";
import { effectiveRule, ruleUrlOf } from "../source/site-rules";
import type { ModelConfig, Settings } from "../storage/settings";
import { applySiteRules } from "./explain";

export type ImportedRoute =
  { kind: "ok"; model: ModelConfig; remote: boolean; term: string; title: string } | { kind: "error"; code: ErrorCode };

/** The look-ups recorded without an explanation (terms imported from Zotero), oldest first. */
export function unexplainedEncounters(state: State): string[] {
  return [...state.encounters.values()].filter((e) => e.explanation.text === "").map((e) => e.id);
}

/**
 * The model that would explain a look-up recorded without an explanation, as an explanation on its page would be routed:
 * a look-up from a sensitive source only ever goes to a local model. Only the term and its paper's title are sent.
 */
export function routeImported(settings: Settings, state: State, encounterId: string): ImportedRoute {
  const enc = state.encounters.get(encounterId);
  if (!enc || enc.explanation.text !== "") return { kind: "error", code: "expired" };
  const ruled = applySiteRules(state, settings.sites);
  const source = ruled.sources.get(enc.sourceId);
  const rule = effectiveRule(settings.sites, (source && ruleUrlOf(source.ids)) ?? "");
  // Turned off for the site its page is on: nothing about it is sent, as on the page itself.
  if (rule.disabled) return { kind: "error", code: "site_disabled" };
  const chosen = chooseModel(settings, rule, isSensitiveSource(ruled, enc.sourceId));
  if (chosen.kind === "error") return { kind: "error", code: chosen.code };
  return { kind: "ok", model: chosen.model, remote: chosen.remote, term: enc.selection, title: source?.title || "" };
}

/** Room for the explanation's text in its event, leaving the rest of the size limit for the event around it. */
const EXPLANATION_BYTES = LIMITS.maxEventBytes - 4096;

/**
 * The explanation recorded on an imported look-up: the reply cut to the card's length, and further if needed so the event
 * stays under the size limit however many bytes its characters take.
 */
export function importedExplanation(reply: string, model: string): Explanation {
  let text = reply.slice(0, CARD_LIMITS.maxExplanationLength);
  const fits = (n: number) => utf8Length(JSON.stringify(text.slice(0, n))) <= EXPLANATION_BYTES;
  if (!fits(text.length)) {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
    // Never ends on half of a character that takes two code units.
    const last = text.charCodeAt(lo - 1);
    text = text.slice(0, last >= 0xd800 && last <= 0xdbff ? lo - 1 : lo);
  }
  return { text, tier: "external_knowledge", evidence_span: null, model: model.slice(0, CARD_LIMITS.maxModelNameLength) };
}
