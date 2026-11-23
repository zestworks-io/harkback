import {
  buildFormulaPrompt,
  parseFormulaOutput,
  streamingFormulaGist,
  type ChatMessage,
  type FormulaDefinition,
  type FormulaRequest,
  type FormulaResult,
  type State,
} from "@harkback/core";
import type { PortOut } from "../messaging/messages";
import { ModelError } from "../models/model-error";
import { explainLanguageOf, type ModelConfig, type Settings } from "../storage/settings";
import { routeFollowUp, type ExplainRequestMsg, type PageContext, type PlanError } from "./explain";

/** What the page adds to an explain request when the selection is a formula, or one symbol of it. */
export interface FormulaRequestMsg {
  tex: string;
  symbol?: string;
  definitions: FormulaDefinition[];
  /** Read from a PDF's text rather than from the formula's source. */
  approximate?: boolean;
}

export interface FormulaPlan {
  kind: "ok";
  model: ModelConfig;
  messages: ChatMessage[];
  formula: FormulaRequest;
}

/** Routed exactly as a term is: site rules, sensitive sources to the local model only, the page's privacy question. */
export function planFormula(
  req: ExplainRequestMsg & { formula: FormulaRequestMsg },
  ctx: PageContext,
  settings: Settings,
  state: State,
): FormulaPlan | { kind: "error"; code: PlanError } {
  const tex = req.formula.tex.trim();
  if (!/[\p{L}\p{N}]/u.test(tex)) return { kind: "error", code: "empty_selection" };
  const routed = routeFollowUp(req, ctx, settings, state);
  if (routed.kind === "error") return routed;
  const formula: FormulaRequest = {
    tex,
    ...(req.formula.symbol ? { symbol: req.formula.symbol } : {}),
    paragraph: req.paragraph,
    section: req.section,
    pageTitle: req.pageTitle,
    definitions: req.formula.definitions,
    language: explainLanguageOf(settings),
    mode: req.mode === "reexplain" ? "reexplain" : "explain",
    ...(req.formula.approximate ? { approximate: true } : {}),
  };
  return { kind: "ok", model: routed.model, messages: buildFormulaPrompt(formula), formula };
}

export interface FormulaDeps {
  /** Streams the model's reply, calling `onDelta` with all of it so far; resolves to the whole reply. */
  stream(onDelta: (full: string) => void): Promise<string>;
  post(m: PortOut): void;
  sensitive: boolean;
}

/** Asks the model and shows the answer. A formula explanation is never recorded: no event is written for it. */
export async function answerFormula(plan: FormulaPlan, deps: FormulaDeps): Promise<FormulaResult> {
  let shown = "";
  const raw = await deps.stream((full) => {
    const gist = streamingFormulaGist(full);
    if (gist === shown) return;
    shown = gist;
    deps.post({ type: "formula_delta", gist });
  });
  const result = parseFormulaOutput(raw, plan.formula);
  if (!result.gist.trim() && result.symbols.length === 0) throw new ModelError("http", "the reply had no explanation");
  deps.post({ type: "formula", result, approximate: plan.formula.approximate === true });
  deps.post({ type: "done", encounterId: null, recorded: false, sensitive: deps.sensitive });
  return result;
}

/** What a follow-up question is told the card said. */
export function formulaFollowUpContext(result: FormulaResult): string {
  return [result.gist, ...result.symbols.map((s) => `${s.tex}: ${s.meaning}`)].join("\n");
}
