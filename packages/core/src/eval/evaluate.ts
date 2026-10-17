import type { HarkEvent, Rel, Tier } from "@harkback/spec";
import { findCandidates } from "../concepts/candidates";
import { Matcher, matcherEntriesFromState } from "../concepts/matcher";
import { identityKey } from "../concepts/normalize";
import { selectReunions } from "../concepts/reunion";
import { DAY_MS, THRESHOLDS } from "../constants";
import { createEventFactory } from "../events/factory";
import { replay } from "../events/replay";
import type { State } from "../events/state";
import { verifyEvidence } from "../llm/evidence";
import { parseModelOutput } from "../llm/parse-output";
import { buildExplainPrompt, type ChatMessage } from "../llm/prompt";
import { buildRecordEvents, resolveConcept } from "../llm/record";
import {
  bCubed,
  definedInSourcePrecision,
  evidenceVerificationRate,
  ratio,
  relationJudge,
  reunionPrecision,
  sameConceptPrecision,
  type BCubed,
  type LabelledRelation,
  type Ratio,
} from "./metrics";

export interface EvalLookup {
  selection: string;
  /** Index into the paper's paragraphs: the one the selection is made in, which is sent to the model. */
  paragraph: number;
  /** Gold label of the concept the selection names. */
  concept: string;
  /** Whether the paper itself defines the term, so an explanation recorded as `defined_in_source` is right. */
  defined: boolean;
}

export interface EvalPaper {
  id: string;
  title: string;
  abstract: string;
  /** Gold labels of the concepts a reunion hint should be shown for when the paper is opened, given the papers read before it. */
  reunions: string[];
  paragraphs: { section: string; text: string }[];
  /** Selections in reading order. */
  lookups: EvalLookup[];
}

export interface EvalSet {
  /** Gold label -> the names of the concept. A concept the model names, but nobody looked up, is labelled by these names. */
  concepts: Record<string, string[]>;
  /** `variant_of`: from is a variant or kind of to. `prerequisite`: from requires understanding to first. */
  relations: { from: string; rel: Exclude<Rel, "related">; to: string }[];
  /** In reading order. */
  papers: EvalPaper[];
}

/** Answers one explain prompt. `key` names the lookup, so recorded answers can be replayed. */
export type Complete = (key: string, messages: ChatMessage[]) => Promise<string>;

/** Saved model answers, keyed by `lookupKey`, so a run can be scored again without the model. */
export interface Recording {
  model: string;
  outputs: Record<string, string>;
}

/** Answers from a recording; a lookup it has no answer for is an error, since the run would no longer be the one recorded. */
export function replayRecording(recording: Recording): Complete {
  return async (key) => {
    const raw = recording.outputs[key];
    if (raw === undefined) throw new Error(`the recording has no answer for ${key}`);
    return raw;
  };
}

export interface EvalMetrics {
  reunionPrecision: Ratio;
  reunionRecall: Ratio;
  /** `variant_of` edges a reader is shown: confirmed ones, or proposed ones at or above the related-edge confidence. */
  shownEdgePrecision: Ratio;
  /** `prerequisite` edges shown by the same rule. */
  prerequisitePrecision: Ratio;
  definedInSourcePrecision: Ratio;
  evidenceVerification: Ratio;
  sameConceptPrecision: Ratio;
  clustering: BCubed;
}

export interface EvalReport {
  metrics: EvalMetrics;
  /** One line per wrong or missing item, for extending the labels or finding what went wrong. */
  misses: string[];
}

export const lookupKey = (paper: EvalPaper, index: number): string => `${paper.id}#${index + 1}`;

const DEVICE = "dev_e0a1";
const START = Date.UTC(2026, 0, 5);
/** Papers are read a week apart, so every earlier paper is old enough for a reunion. */
const PAPER_GAP_DAYS = 7;

const pageText = (paper: EvalPaper): string => [paper.title, paper.abstract, ...paper.paragraphs.map((p) => p.text)].join("\n\n");

/**
 * Reads the papers in order the way the extension does: on opening a paper the known concepts are matched and reunions
 * selected; each lookup gets candidates, the real explain prompt, the model's answer, the evidence check and the recorded
 * events. Where the extension would ask the reader whether a term is a known concept, the gold label answers.
 */
export async function evaluate(set: EvalSet, complete: Complete): Promise<EvalReport> {
  let seq = 0;
  let ids = 0;
  let now = START;
  const newId = () => `01J${String(++ids).padStart(23, "0")}`;
  const f = createEventFactory({ device: DEVICE, nextSeq: () => ++seq, now: () => now, newId });
  const events: HarkEvent[] = [];
  let state = replay([]);

  const goldOfEncounter = new Map<string, string>();
  const goldOfName = new Map<string, string>();
  for (const [label, names] of Object.entries(set.concepts)) for (const name of names) goldOfName.set(identityKey(name), label);

  /** A concept's gold label: the most common label of its lookups, or for a concept nobody looked up, a labelled name. */
  const labelOf = (s: State, conceptId: string): string | null => {
    const rep = s.representative.get(conceptId) ?? conceptId;
    const counts = new Map<string, number>();
    for (const eid of s.encountersByConcept.get(rep) ?? []) {
      const label = goldOfEncounter.get(eid);
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    if (counts.size > 0) return [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    for (const name of s.concepts.get(rep)?.names ?? []) {
      const label = goldOfName.get(identityKey(name));
      if (label) return label;
    }
    return null;
  };
  const nameOf = (s: State, conceptId: string) => s.concepts.get(s.representative.get(conceptId) ?? conceptId)?.canonicalName ?? conceptId;

  const misses: string[] = [];
  const shown: { label: string | null; expected: readonly string[] }[] = [];
  let expectedFound = 0;
  let expectedTotal = 0;
  const samples: { tier: Tier; defined: boolean; evidence: string | null; verified: boolean }[] = [];
  const joins: { predicted: string | null; gold: string }[] = [];

  for (const [p, paper] of set.papers.entries()) {
    now = START + p * PAPER_GAP_DAYS * DAY_MS;
    const sourceId = `eval:${paper.id}`;
    const text = pageText(paper);

    const hits = new Matcher(matcherEntriesFromState(state)).scan(text);
    const labels = new Set<string>();
    // Every reunion is judged, not just the few a page shows at once.
    for (const r of selectReunions(state, hits, { sourceId, now, maxPerPage: Number.POSITIVE_INFINITY })) {
      const conceptId = r.kind === "direct" ? r.conceptId : r.viaConceptId;
      const label = labelOf(state, conceptId);
      shown.push({ label, expected: paper.reunions });
      if (label) labels.add(label);
      if (!label || !paper.reunions.includes(label)) {
        misses.push(`${paper.id}: reunion shown for "${nameOf(state, conceptId)}" (${label ?? "unlabelled"})`);
      }
    }
    for (const label of paper.reunions) {
      expectedTotal++;
      if (labels.has(label)) expectedFound++;
      else misses.push(`${paper.id}: no reunion shown for ${label}`);
    }

    for (const [i, lookup] of paper.lookups.entries()) {
      now += 60_000;
      const key = lookupKey(paper, i);
      const paragraph = paper.paragraphs[lookup.paragraph];
      if (!paragraph) throw new Error(`${key}: no paragraph ${lookup.paragraph}`);
      const candidates = findCandidates(state, lookup.selection);
      const prompt = buildExplainPrompt({
        selection: lookup.selection,
        paragraph: paragraph.text,
        section: paragraph.section,
        pageTitle: paper.title,
        abstractFirstSentence: paper.abstract.split(/(?<=\.)\s/)[0]!,
        candidates,
        language: "en",
      });
      const parsed = parseModelOutput(await complete(key, prompt.messages), prompt.labels);
      const verified = verifyEvidence(parsed.evidence, text);
      const tier: Tier = verified ? "defined_in_source" : "external_knowledge";
      samples.push({ tier, defined: lookup.defined, evidence: parsed.evidence, verified });
      if (verified && !lookup.defined) misses.push(`${key}: "${lookup.selection}" recorded as defined in the source`);
      if (parsed.evidence !== null && !verified) misses.push(`${key}: evidence not found on the page`);

      const resolution = resolveConcept(parsed, candidates, state);
      let conceptId: string | null = null;
      if (resolution.kind === "existing") {
        conceptId = resolution.conceptId;
        const predicted = labelOf(state, conceptId);
        joins.push({ predicted, gold: lookup.concept });
        if (predicted !== lookup.concept) misses.push(`${key}: "${lookup.selection}" joined to "${nameOf(state, conceptId)}"`);
      } else if (resolution.kind === "ask_user" && labelOf(state, resolution.candidate.conceptId) === lookup.concept) {
        conceptId = resolution.candidate.conceptId;
      }

      const batch = buildRecordEvents({
        factory: f,
        state,
        source: { source_id: sourceId, ids: {}, title: paper.title, license: "unknown", sensitivity: "normal" },
        selection: lookup.selection,
        locator: { exact: lookup.selection, prefix: "", suffix: "", section: paragraph.section },
        parsed,
        tier,
        model: "eval",
        conceptId,
        language: "en",
        newId,
      });
      for (const e of batch) if (e.type === "encounter.created" && e.payload) goldOfEncounter.set(e.payload.encounter_id, lookup.concept);
      events.push(...batch);
      state = replay(events);
    }
  }

  const judge = relationJudge(set.relations);
  const edges: Record<"variant_of" | "prerequisite", boolean[]> = { variant_of: [], prerequisite: [] };
  for (const e of state.edges.values()) {
    if (e.rel === "related" || e.status === "rejected") continue;
    if (e.status !== "confirmed" && e.confidence < THRESHOLDS.relatedEdgeConfidence) continue;
    const relation: LabelledRelation = { from: labelOf(state, e.from), rel: e.rel, to: labelOf(state, e.to) };
    const right = judge(relation);
    edges[e.rel].push(right);
    if (!right) {
      misses.push(
        `edge: "${nameOf(state, e.from)}" ${e.rel} "${nameOf(state, e.to)}" (${relation.from ?? "unlabelled"} ${e.rel} ${relation.to ?? "unlabelled"})`,
      );
    }
  }
  const share = (judged: boolean[]) => ratio(judged.filter(Boolean).length, judged.length);

  return {
    metrics: {
      reunionPrecision: reunionPrecision(shown),
      reunionRecall: ratio(expectedFound, expectedTotal),
      shownEdgePrecision: share(edges.variant_of),
      prerequisitePrecision: share(edges.prerequisite),
      definedInSourcePrecision: definedInSourcePrecision(samples),
      evidenceVerification: evidenceVerificationRate(samples),
      sameConceptPrecision: sameConceptPrecision(joins),
      clustering: bCubed([...goldOfEncounter].map(([eid, gold]) => ({ predicted: state.encounters.get(eid)!.conceptId, gold }))),
    },
    misses,
  };
}
