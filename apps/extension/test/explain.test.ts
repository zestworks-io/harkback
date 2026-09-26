import { describe, expect, it } from "vitest";
import { createEventFactory, replay, type Hit } from "@harkback/core";
import { parseEvent } from "@harkback/spec";
import { cooccurrenceEdge } from "../src/lib/cooccurrence";
import { buildExplainRecord, daysSinceLastEncounter, finishExplain, planExplain, routeFollowUp, type ExplainPlan, type ExplainRequestMsg } from "../src/lib/explain";
import { preview, reunionCards } from "../src/lib/reunion-cards";
import { DEFAULT_SETTINGS, type ModelConfig, type Settings } from "../src/lib/settings";
import { world } from "./helpers";

const remote: ModelConfig = { id: "r", label: "Remote", baseUrl: "https://api.example.com/v1", apiKey: "k", model: "gpt" };
const local: ModelConfig = { id: "l", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "qwen" };
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, models: [remote, local], defaultModelId: "r", localModelId: "l", ...o });
const ctx = { url: "https://arxiv.org/html/2305.14314", incognito: false };
const req = (o: Partial<ExplainRequestMsg> = {}): ExplainRequestMsg => ({
  mode: "explain",
  selection: "LoRA",
  paragraph: "We apply LoRA to attention.",
  paragraphId: "b3",
  section: "1 Introduction",
  pageTitle: "QLoRA",
  abstractFirstSentence: "We present QLoRA.",
  pageText: "We apply LoRA to attention. LoRA freezes the pre-trained weights.",
  locator: { exact: "LoRA", prefix: "We apply", suffix: "to attention." },
  source: { source_id: "arxiv:2305.14314", ids: { arxiv: "2305.14314" }, title: "QLoRA", license: "unknown" },
  ...o,
});
const planOf = (r: ReturnType<typeof planExplain>): ExplainPlan => {
  if (r.kind !== "ok") throw new Error(r.code);
  return r.plan;
};

describe("planExplain", () => {
  it("routes to the default model and offers known concepts as candidates", () => {
    const w = world();
    w.source("arxiv:2106.09685");
    const lora = w.concept("LoRA", ["Low-Rank Adaptation"]);
    w.encounter(lora, "arxiv:2106.09685");
    const plan = planOf(planExplain(req(), ctx, settings(), w.state()));
    expect(plan.remote).toBe(true);
    expect(plan.model.id).toBe("r");
    expect(plan.prompt.labels.get("c1")).toBe(lora);
    expect(plan.prompt.messages[1]!.content).toContain("c1: LoRA (ml)");
  });

  it("keeps sensitive-only concepts out of remote prompts but still returns them for the local question", () => {
    const w = world();
    w.source("intranet:1", "sensitive");
    const secret = w.concept("LoRA");
    w.encounter(secret, "intranet:1");
    const plan = planOf(planExplain(req(), ctx, settings(), w.state()));
    expect(plan.prompt.labels.size).toBe(0);
    expect(plan.candidates.map((c) => c.conceptId)).toEqual([secret]);
  });

  it("uses only the local model for sensitive sites and sources marked sensitive", () => {
    const rule = { pattern: "arxiv.org", sensitive: true };
    expect(planExplain(req(), ctx, settings({ sites: [rule], localModelId: null }), world().state())).toEqual({ kind: "error", code: "needs_local_model" });
    expect(planOf(planExplain(req(), ctx, settings({ sites: [rule] }), world().state())).remote).toBe(false);
    const w = world();
    w.source("arxiv:2305.14314", "sensitive");
    const plan = planOf(planExplain(req(), ctx, settings(), w.state()));
    expect(plan.remote).toBe(false);
    expect(plan.sensitive).toBe(true);
  });

  it("refuses disabled sites and selections without letters", () => {
    expect(planExplain(req(), ctx, settings({ sites: [{ pattern: "arxiv.org", disabled: true }] }), world().state())).toEqual({ kind: "error", code: "site_disabled" });
    expect(planExplain(req({ selection: "→" }), ctx, settings(), world().state())).toEqual({ kind: "error", code: "empty_selection" });
  });

  it("includes the earlier encounter when comparing, unless it is sensitive and the model is remote", () => {
    const w = world();
    w.source("arxiv:2106.09685", "normal", "LoRA paper");
    const lora = w.concept("LoRA");
    const normal = w.encounter(lora, "arxiv:2106.09685", "冻结权重旁加低秩矩阵");
    w.source("intranet:1", "sensitive");
    const secret = w.encounter(lora, "intranet:1", "internal note");
    const state = w.state();
    const plan = planOf(planExplain(req({ mode: "compare", earlierEncounterId: normal }), ctx, settings(), state));
    expect(plan.prompt.messages[1]!.content).toContain("冻结权重旁加低秩矩阵");
    expect(plan.prompt.messages[1]!.content).toContain("Title: LoRA paper");
    expect(planExplain(req({ mode: "compare", earlierEncounterId: secret }), ctx, settings(), state)).toEqual({ kind: "error", code: "sensitive_compare" });
  });
});

describe("finishExplain", () => {
  it("verifies evidence against the page and resolves the model's match", () => {
    const w = world();
    const lora = w.concept("LoRA");
    w.encounter(lora, "arxiv:2106.09685");
    const plan = planOf(planExplain(req(), ctx, settings(), w.state()));
    const raw =
      '<explanation>低秩适配。</explanation><evidence>LoRA freezes the pre-trained weights</evidence><card>{"match":"c1","canonical":"LoRA","aliases":[],"domain":"ml","broader":[],"variants":[],"prerequisites":[],"confidence":{}}</card>';
    const out = finishExplain(raw, plan, req());
    expect(out.tier).toBe("defined_in_source");
    expect(out.resolution).toEqual({ kind: "existing", conceptId: lora });
    expect(finishExplain("<explanation>x</explanation><evidence>made up quote here</evidence>", plan, req()).tier).toBe("external_knowledge");
  });
});

describe("buildExplainRecord", () => {
  const plainCard = '<card>{"match":null,"canonical":"QLoRA","aliases":[],"domain":"ml","broader":[],"variants":[],"prerequisites":[],"confidence":{}}</card>';

  it("records the encounter and a co-occurrence edge with the previous lookup in the same paragraph", () => {
    const w = world();
    const lora = w.concept("LoRA");
    w.encounter(lora, "arxiv:2106.09685");
    const state = w.state();
    const plan = planOf(planExplain(req({ selection: "QLoRA" }), ctx, settings(), state));
    const outcome = finishExplain(`<explanation>量化。</explanation><evidence>NONE</evidence>${plainCard}`, plan, req({ selection: "QLoRA" }));
    let seq = 0;
    const f = createEventFactory({ device: "dev_bbbb", nextSeq: () => ++seq, now: () => Date.UTC(2026, 8, 25) });
    const previous = { sourceId: "arxiv:2305.14314", paragraphId: "b3", conceptId: lora, at: Date.UTC(2026, 8, 25) - 60_000 };
    const record = buildExplainRecord(f, outcome, req({ selection: "QLoRA" }), null, { state, model: remote, sensitive: false, now: Date.UTC(2026, 8, 25), previous });
    for (const e of record.events) expect(parseEvent(e).kind).toBe("event");
    const edge = record.events.find((e) => e.type === "edge.proposed" && e.payload.source === "cooccurrence");
    expect(edge?.type === "edge.proposed" && edge.payload).toMatchObject({ rel: "related", confidence: 0.3, evidence: { encounter_id: record.encounterId } });
    expect(record.lookup).toEqual({ sourceId: "arxiv:2305.14314", paragraphId: "b3", conceptId: record.conceptId, at: Date.UTC(2026, 8, 25) });
    const after = replay([...w.events, ...record.events]);
    expect(after.encounters.get(record.encounterId)?.explanation.model).toBe("gpt");
  });

  it("marks the earlier encounter when the explanation came from a reunion", () => {
    const w = world();
    const lora = w.concept("LoRA");
    const earlier = w.encounter(lora, "arxiv:2106.09685");
    const state = w.state();
    const r = req({ mode: "compare", earlierEncounterId: earlier });
    const plan = planOf(planExplain(r, ctx, settings(), state));
    const outcome = finishExplain("<explanation>对比。</explanation><evidence>NONE</evidence>", plan, r);
    let seq = 0;
    const f = createEventFactory({ device: "dev_bbbb", nextSeq: () => ++seq });
    const record = buildExplainRecord(f, outcome, r, lora, { state, model: remote, sensitive: false, now: Date.now(), previous: undefined });
    const action = record.events.find((e) => e.type === "encounter.action");
    expect(action?.type === "encounter.action" && action.payload).toEqual({ encounter_id: earlier, action: "reunion_compare" });
  });
});

describe("cooccurrenceEdge", () => {
  const a = { sourceId: "s", paragraphId: "b1", conceptId: "01J00000000000000000000001", at: 0 };
  const b = { sourceId: "s", paragraphId: "b1", conceptId: "01J00000000000000000000002", at: 1000 };
  it("links consecutive lookups in the same paragraph, in a stable direction", () => {
    expect(cooccurrenceEdge(b, { ...a, at: 2000 })).toEqual({ from: a.conceptId, to: b.conceptId });
    expect(cooccurrenceEdge(a, b)).toEqual({ from: a.conceptId, to: b.conceptId });
  });
  it("ignores other paragraphs, the same concept and stale lookups", () => {
    expect(cooccurrenceEdge(undefined, b)).toBeNull();
    expect(cooccurrenceEdge(a, { ...b, paragraphId: "b2" })).toBeNull();
    expect(cooccurrenceEdge(a, { ...a, at: 5 })).toBeNull();
    expect(cooccurrenceEdge(a, { ...b, at: 3_600_000 })).toBeNull();
  });
});

describe("reunion cards", () => {
  it("describes each reunion for display", () => {
    const w = world(Date.UTC(2026, 8, 1));
    w.source("arxiv:2106.09685", "normal", "LoRA paper");
    const lora = w.concept("LoRA");
    const enc = w.encounter(lora, "arxiv:2106.09685", "在冻结的权重旁加两个低秩矩阵。");
    const state = w.state();
    const hits: Hit[] = [{ key: "LoRA", start: 10, end: 14, text: "LoRA" }];
    const cards = reunionCards(state, hits, { sourceId: "arxiv:2305.14314", now: Date.UTC(2026, 8, 13), minGapDays: 3, maxPerPage: 3 });
    expect(cards).toEqual([
      {
        kind: "direct",
        conceptId: lora,
        conceptName: "LoRA",
        viaName: null,
        start: 10,
        end: 14,
        encounterId: enc,
        daysAgo: 12,
        sourceTitle: "LoRA paper",
        section: "2 Method",
        tier: "external_knowledge",
        preview: "在冻结的权重旁加两个低秩矩阵。",
      },
    ]);
    expect(daysSinceLastEncounter(state, lora, Date.UTC(2026, 8, 13))).toBe(12);
    expect(preview("a ".repeat(200), 10)).toBe("a a a a a…");
  });
});

describe("sensitivity decided after the fact", () => {
  const wikiRule = { pattern: "wiki.corp.com", sensitive: true };

  it("routes follow-ups to the local model once the source has been marked sensitive", () => {
    expect(routeFollowUp(req(), ctx, settings(), world().state())).toEqual({ kind: "ok", model: remote });
    const w = world();
    w.source("arxiv:2305.14314", "sensitive");
    expect(routeFollowUp(req(), ctx, settings(), w.state())).toEqual({ kind: "ok", model: local });
    expect(routeFollowUp(req(), ctx, settings({ localModelId: null }), w.state())).toEqual({ kind: "error", code: "needs_local_model" });
  });

  it("applies a sensitive site rule added later to sources recorded before it", () => {
    const w = world();
    w.source("url:https://wiki.corp.com/lora", "normal", "Wiki", { url: "https://wiki.corp.com/lora" });
    const lora = w.concept("LoRA");
    const earlier = w.encounter(lora, "url:https://wiki.corp.com/lora", "internal note");
    const state = w.state();
    const s = settings({ sites: [wikiRule] });
    expect(planExplain(req({ mode: "compare", earlierEncounterId: earlier }), ctx, s, state)).toEqual({ kind: "error", code: "sensitive_compare" });
    const plan = planOf(planExplain(req(), ctx, s, state));
    expect(plan.prompt.labels.size).toBe(0);
    expect(plan.candidates.map((c) => c.conceptId)).toEqual([lora]);
  });
});
