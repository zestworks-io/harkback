// Measures explanation quality on the labelled set and checks the release gates. Exits with 1 when a gate fails.
//
//   pnpm eval                          ask the model named by HB_EVAL_BASE_URL, HB_EVAL_API_KEY and HB_EVAL_MODEL
//   pnpm eval --record out.json        ... and save its answers
//   pnpm eval --replay out.json        score saved answers without the network
//   pnpm eval --baseline base.json     also require the B-cubed F1 in base.json ({"bCubedF1": 0.9}) not to drop
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { evaluate, replayRecording, type Complete, type EvalMetrics, type Recording } from "../../packages/core/src/eval/evaluate";
import { checkGates, type Baseline } from "../../packages/core/src/eval/gates";
import type { Ratio } from "../../packages/core/src/eval/metrics";
import { EVAL_SET } from "../../packages/core/test/eval/cases";

const { values: args } = parseArgs({ options: { replay: { type: "string" }, record: { type: "string" }, baseline: { type: "string" } } });
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

const report = await evaluate(EVAL_SET, complete);
if (args.record) writeFileSync(args.record, `${JSON.stringify(recording, null, 2)}\n`);

const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1)}%`);
const row = (name: string, value: string, detail = "") => out(`  ${name.padEnd(34)}${value.padStart(7)}  ${detail}`);
const ratioRow = (name: string, r: Ratio) => row(name, pct(r.value), `${r.hits}/${r.total}`);
const m: EvalMetrics = report.metrics;

out(`Model: ${recording.model || "unknown"}`);
out();
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

const baseline = args.baseline ? (JSON.parse(readFileSync(args.baseline, "utf8")) as Baseline) : undefined;
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

if (gates.some((g) => !g.pass)) process.exitCode = 1;
