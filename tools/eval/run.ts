// Measures explanation quality on the labelled set and checks the release gates. Exits with 1 when a gate fails.
//
//   pnpm eval                          ask the model named by HB_EVAL_BASE_URL, HB_EVAL_API_KEY and HB_EVAL_MODEL
//   pnpm eval --record out.json        ... and save its answers
//   pnpm eval --replay out.json        score saved answers without the network
//   pnpm eval --baseline base.json     also require the B-cubed F1 in base.json not to drop: {"bCubedF1": 0.9} for every
//                                      set, or one per set: {"ml": {"bCubedF1": 0.9}, "quantum": {"bCubedF1": 0.8}}
//   pnpm eval --set quantum            only that field's set (ml, quantum); every set by default
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  evaluate,
  lookupKey,
  replayRecording,
  type Complete,
  type EvalMetrics,
  type Recording,
} from "../../packages/core/src/eval/evaluate";
import { checkGates, type Baseline } from "../../packages/core/src/eval/gates";
import type { Ratio } from "../../packages/core/src/eval/metrics";
import { EVAL_SETS } from "../../packages/core/test/eval/cases";

const { values: args } = parseArgs({
  options: { replay: { type: "string" }, record: { type: "string" }, baseline: { type: "string" }, set: { type: "string" } },
});
const out = (line = "") => process.stdout.write(`${line}\n`);

function liveModel(): { model: string; complete: Complete } {
  const base = process.env.HB_EVAL_BASE_URL?.replace(/\/+$/, "");
  const model = process.env.HB_EVAL_MODEL;
  if (!base || !model) throw new Error("set HB_EVAL_BASE_URL and HB_EVAL_MODEL, or pass --replay <file>");
  const key = process.env.HB_EVAL_API_KEY;
  return {
    model,
    complete: async (_key, messages) => {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key && { authorization: `Bearer ${key}` }) },
        body: JSON.stringify({ model, messages, temperature: 0 }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? "";
    },
  };
}

const recording: Recording = args.replay ? (JSON.parse(readFileSync(args.replay, "utf8")) as Recording) : { model: "", outputs: {} };
let complete: Complete;
if (args.replay) {
  complete = replayRecording(recording);
} else {
  const live = liveModel();
  recording.model = live.model;
  complete = async (key, messages) => (recording.outputs[key] = await live.complete(key, messages));
}

const names = args.set ? [args.set] : Object.keys(EVAL_SETS);
for (const name of names)
  if (!Object.hasOwn(EVAL_SETS, name)) throw new Error(`no set "${name}"; the sets are ${Object.keys(EVAL_SETS).join(", ")}`);
const baselines = args.baseline ? (JSON.parse(readFileSync(args.baseline, "utf8")) as Baseline & Record<string, Baseline>) : undefined;

const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1)}%`);
const row = (name: string, value: string, detail = "") => out(`  ${name.padEnd(34)}${value.padStart(7)}  ${detail}`);
const ratioRow = (name: string, r: Ratio) => row(name, pct(r.value), `${r.hits}/${r.total}`);

out(`Model: ${recording.model || "unknown"}`);
let failed = false;
let scored = 0;
try {
  for (const name of names) {
    const set = EVAL_SETS[name]!;
    out();
    out(`== ${name} (${set.papers.length} papers, ${set.papers.reduce((n, p) => n + p.lookups.length, 0)} lookups)`);
    // A recording made for other sets has nothing for this one: skipped, and a failure when it was the set asked for. A
    // recording with some of the set's answers is scored, so a lookup added since fails on its missing answer.
    if (args.replay && set.papers.every((p) => p.lookups.every((_, i) => recording.outputs[lookupKey(p, i)] === undefined))) {
      out("  skipped: the recording has no answers for this set");
      if (args.set) failed = true;
      continue;
    }
    scored++;
    const report = await evaluate(set, complete);
    const m: EvalMetrics = report.metrics;

    out("Metrics");
    ratioRow("reunion precision", m.reunionPrecision);
    ratioRow("reunion recall", m.reunionRecall);
    ratioRow("shown variant_of edge precision", m.shownEdgePrecision);
    ratioRow("shown prerequisite edge precision", m.prerequisitePrecision);
    ratioRow("defined_in_source precision", m.definedInSourcePrecision);
    ratioRow("evidence verification rate", m.evidenceVerification);
    ratioRow("same-concept precision", m.sameConceptPrecision);
    row("B-cubed precision", pct(m.clustering.precision));
    row("B-cubed recall", pct(m.clustering.recall));
    row("B-cubed F1", pct(m.clustering.f1));

    const baseline = baselines ? (baselines[name] ?? (typeof baselines.bCubedF1 === "number" ? baselines : undefined)) : undefined;
    const gates = checkGates(m, baseline);
    out();
    out("Release gates");
    for (const g of gates) {
      const target = g.threshold === null ? "no baseline yet" : `>= ${pct(g.threshold)}`;
      row(g.name, pct(g.measured), `${target.padEnd(16)}${g.pass ? "pass" : "FAIL"}`);
    }
    if (report.misses.length > 0) {
      out();
      out("Misses");
      for (const miss of report.misses) out(`  ${miss}`);
    }
    if (gates.some((g) => !g.pass)) failed = true;
  }
} finally {
  // Answers already paid for are kept even when a later set fails.
  if (args.record) writeFileSync(args.record, `${JSON.stringify(recording, null, 2)}\n`);
}
// Nothing scored is nothing measured, which passes no gate.
if (failed || scored === 0) process.exitCode = 1;
