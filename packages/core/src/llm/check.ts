import type { Grade } from "../review/grade";

export type Verdict = "correct" | "partial" | "incorrect";

export interface CheckResult {
  verdict: Verdict;
  feedback: string;
  /** The grade to highlight; the reader still chooses. Never "easy": only the reader knows that. */
  suggested: Grade;
}

const SUGGESTED: Record<Verdict, Grade> = { correct: 3, partial: 2, incorrect: 1 };
const MAX_FEEDBACK = 600;

/** Reads the reply to `buildCheckPrompt`; null when it names no verdict. */
export function parseCheckReply(raw: string): CheckResult | null {
  const verdict = /<verdict>\s*(correct|partial|incorrect)\s*<\/verdict>/i.exec(raw)?.[1]?.toLowerCase() as Verdict | undefined;
  if (!verdict) return null;
  const closed = /<feedback>([\s\S]*?)<\/feedback>/i.exec(raw)?.[1];
  // A reply cut off by the token limit still has a usable beginning.
  const open = closed === undefined ? /<feedback>([\s\S]*)$/i.exec(raw)?.[1] : undefined;
  const feedback = (closed ?? open ?? "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, MAX_FEEDBACK);
  return { verdict, feedback, suggested: SUGGESTED[verdict] };
}
