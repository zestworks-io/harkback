import type { State } from "@harkback/core";
import { applySiteRules } from "./explain";
import type { ErrorCode } from "./messages";
import { chooseModel } from "./model-policy";
import type { ModelConfig, Settings } from "./settings";
import { effectiveRule } from "./site-rules";

export type CheckRoute =
  | { kind: "ok"; model: ModelConfig; remote: boolean; sensitive: boolean; term: string; explanation: string }
  | { kind: "error"; code: ErrorCode };

/**
 * Where "Check my answer" would go for a concept, without sending anything: the model the settings choose, and whether it is
 * remote. A concept whose latest look-up came from a sensitive source only ever goes to a local model, as an explanation would.
 * Fails when the check is turned off, so a page can use the result to decide whether to show the button at all.
 */
export function routeCheck(settings: Settings, state: State, conceptId: string): CheckRoute {
  if (!settings.review.modelCheck) return { kind: "error", code: "internal" };
  const id = state.representative.get(conceptId) ?? conceptId;
  const concept = state.concepts.get(id);
  const latest = state.encounters.get(state.encountersByConcept.get(id)?.at(-1) ?? "");
  if (!concept || concept.isPlaceholder || !latest) return { kind: "error", code: "expired" };
  const source = applySiteRules(state, settings.sites).sources.get(latest.sourceId);
  const sensitive = source?.sensitivity === "sensitive";
  const chosen = chooseModel(settings, effectiveRule(settings.sites, source?.ids.url ?? ""), sensitive);
  if (chosen.kind === "error") return { kind: "error", code: chosen.code };
  return {
    kind: "ok",
    model: chosen.model,
    remote: chosen.remote,
    sensitive,
    term: concept.canonicalName,
    explanation: latest.explanation.text,
  };
}
