import type { EvalSet } from "../../../src/eval/evaluate";
import { CONCEPTS, RELATIONS } from "./concepts";
import { PAPERS } from "./papers";
import { QUANTUM_SET } from "./quantum";

/** The machine learning set: papers on efficient fine-tuning. */
export const EVAL_SET: EvalSet = { concepts: CONCEPTS, relations: RELATIONS, papers: PAPERS };

/** Every set by field. Each is read on its own, as one reader's history: reunions only reach back within a set. */
export const EVAL_SETS: Record<string, EvalSet> = { ml: EVAL_SET, quantum: QUANTUM_SET };
