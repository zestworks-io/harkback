import {
  buildExplainPrompt,
  buildRecordEvents,
  candidatesForModel,
  findCandidates,
  parseModelOutput,
  resolveConcept,
  verifyEvidence,
  type BuiltPrompt,
  type Candidate,
  type EventFactory,
  type ParsedOutput,
  type Resolution,
  type State,
} from "@harkback/core";
import type { HarkEvent, Locator, Tier } from "@harkback/spec";
import { cooccurrenceEdge, type LastLookup } from "./cooccurrence";
import { chooseModel } from "./routing";
import type { ModelConfig, Settings } from "./settings";
import { effectiveRule } from "./site-rules";
import type { DetectedSource } from "./source-id";

const DAY_MS = 86_400_000;

export interface ExplainRequestMsg {
  mode: "explain" | "reexplain" | "compare";
  selection: string;
  paragraph: string;
  paragraphId: string;
  section: string;
  pageTitle: string;
  abstractFirstSentence: string;
  pageText: string;
  locator: Locator;
  source: DetectedSource;
  /** For explanations started from a reunion card: the earlier encounter. */
  earlierEncounterId?: string;
  /** For explanations started from a reunion card: the concept found on the page; recorded without asking. */
  conceptId?: string;
}

export interface PageContext {
  url: string;
  incognito: boolean;
}

export type PlanError = "site_disabled" | "no_model" | "needs_local_model" | "insecure_model" | "sensitive_compare" | "empty_selection";

export interface ExplainPlan {
  model: ModelConfig;
  remote: boolean;
  sensitive: boolean;
  prompt: BuiltPrompt;
  /** All candidates, including ones withheld from a remote model; used for the local "same concept?" question. */
  candidates: Candidate[];
}

export function planExplain(
  req: ExplainRequestMsg,
  ctx: PageContext,
  settings: Settings,
  state: State,
): { kind: "ok"; plan: ExplainPlan } | { kind: "error"; code: PlanError } {
  const selection = req.selection.trim();
  if (!/[\p{L}\p{N}]/u.test(selection)) return { kind: "error", code: "empty_selection" };
  const rule = effectiveRule(settings.sites, ctx.url);
  if (rule.disabled) return { kind: "error", code: "site_disabled" };
  const sensitive = rule.sensitive || state.sources.get(req.source.source_id)?.sensitivity === "sensitive";
  const route = chooseModel(settings, rule, sensitive);
  if (route.kind === "error") return { kind: "error", code: route.code };

  let earlier: { title: string; context: string; explanation: string } | undefined;
  if (req.mode === "compare" && req.earlierEncounterId) {
    const enc = state.encounters.get(req.earlierEncounterId);
    if (enc) {
      const source = state.sources.get(enc.sourceId);
      if (source?.sensitivity === "sensitive" && route.remote) return { kind: "error", code: "sensitive_compare" };
      earlier = {
        title: source?.title || enc.sourceId,
        context: `${enc.locator.prefix} ${enc.locator.exact} ${enc.locator.suffix}`.trim(),
        explanation: enc.explanation.text,
      };
    }
  }

  const candidates = findCandidates(state, selection);
  const prompt = buildExplainPrompt({
    selection,
    paragraph: req.paragraph,
    section: req.section,
    pageTitle: req.pageTitle,
    abstractFirstSentence: req.abstractFirstSentence,
    candidates: candidatesForModel(state, candidates, route.remote),
    language: settings.language,
    mode: req.mode,
    ...(earlier ? { earlier } : {}),
  });
  return { kind: "ok", plan: { model: route.model, remote: route.remote, sensitive, prompt, candidates } };
}

export interface ExplainOutcome {
  parsed: ParsedOutput;
  tier: Tier;
  resolution: Resolution;
}

export function finishExplain(raw: string, plan: ExplainPlan, req: ExplainRequestMsg): ExplainOutcome {
  const parsed = parseModelOutput(raw, plan.prompt.labels);
  const tier: Tier = verifyEvidence(parsed.evidence, req.pageText) ? "defined_in_source" : "external_knowledge";
  return { parsed, tier, resolution: resolveConcept(parsed, plan.candidates) };
}

export interface RecordContext {
  state: State;
  model: ModelConfig;
  sensitive: boolean;
  now: number;
  previous: LastLookup | undefined;
}

export interface ExplainRecord {
  events: HarkEvent[];
  encounterId: string;
  conceptId: string;
  lookup: LastLookup;
}

export function buildExplainRecord(
  f: EventFactory,
  outcome: ExplainOutcome,
  req: ExplainRequestMsg,
  conceptId: string | null,
  rc: RecordContext,
): ExplainRecord {
  const events = buildRecordEvents({
    factory: f,
    state: rc.state,
    source: { ...req.source, sensitivity: rc.sensitive ? "sensitive" : "normal" },
    selection: req.selection,
    locator: req.locator,
    parsed: outcome.parsed,
    tier: outcome.tier,
    model: rc.model.model,
    conceptId,
  });
  const created = events.find((e) => e.type === "encounter.created");
  if (created?.type !== "encounter.created" || !created.payload) throw new Error("record without encounter");
  const { encounter_id: encounterId, concept_id: recordedConcept } = created.payload;
  const lookup: LastLookup = { sourceId: req.source.source_id, paragraphId: req.paragraphId, conceptId: recordedConcept, at: rc.now };
  const edge = cooccurrenceEdge(rc.previous, lookup);
  if (edge) {
    events.push(
      f.make("edge.proposed", { ...edge, rel: "related", source: "cooccurrence", confidence: 0.3, evidence: { encounter_id: encounterId } }),
    );
  }
  if (req.earlierEncounterId && req.mode !== "explain" && rc.state.encounters.has(req.earlierEncounterId)) {
    events.push(
      f.make("encounter.action", {
        encounter_id: req.earlierEncounterId,
        action: req.mode === "compare" ? "reunion_compare" : "reunion_reexplain",
      }),
    );
  }
  return { events, encounterId, conceptId: recordedConcept, lookup };
}

export function daysSinceLastEncounter(state: State, conceptId: string, now: number): number {
  const ids = state.encountersByConcept.get(state.representative.get(conceptId) ?? conceptId) ?? [];
  const last = ids.length > 0 ? state.encounters.get(ids[ids.length - 1]!)?.createdAt : undefined;
  return last === undefined ? 0 : Math.max(0, Math.floor((now - last) / DAY_MS));
}
