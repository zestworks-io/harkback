import { isChosenSource, isSensitiveSource, type State } from "@harkback/core";
import type { SiteRule } from "../storage/settings";
import type { Privacy } from "./site-profiles";
import { onPrivateByDefaultSite, sensitiveStated } from "./site-rules";

/** What the reader chose for this page when asked: use only a local model, or send as usual. */
export type Choice = "local" | "anyway";

export const isChoice = (v: unknown): v is Choice => v === "local" || v === "anyway";
export const isPrivacy = (v: unknown): v is Privacy => v === "likely-public" || v === "likely-private" || v === "unknown";

/** `sensitive`: only a local model may see it. `ask`: nothing may be sent until the reader chooses. */
export type Gate = "sensitive" | "normal" | "ask";

export interface GateInput {
  rules: readonly SiteRule[];
  state: State;
  sourceId: string;
  url: string;
  /** What the page itself suggests; a hint only. */
  privacy: Privacy;
  /** The reader's answer on this page, for when it could not be recorded (a private window). */
  choice?: Choice | undefined;
}

/**
 * Whether a page's text may go to a remote model. What the reader has said always wins over what the page suggests, and when
 * the page cannot be judged on a site where most pages are private, the answer is to ask.
 */
export function gateSource(input: GateInput): Gate {
  // The page and the content script are not trusted to send only what the types allow.
  const i = {
    ...input,
    privacy: isPrivacy(input.privacy) ? input.privacy : ("unknown" as const),
    choice: isChoice(input.choice) ? input.choice : undefined,
  };
  if (isSensitiveSource(i.state, i.sourceId)) return "sensitive";
  const stated = sensitiveStated(i.rules, i.url);
  if (stated === true) return "sensitive";
  // A rule that says "fine" settles it, unless the page itself says it is private: a whole site is not one page.
  if (stated === false && i.privacy !== "likely-private") return "normal";
  if (i.choice) return i.choice === "local" ? "sensitive" : "normal";
  if (isChosenSource(i.state, i.sourceId)) return "normal";
  if (i.privacy === "likely-private") return "ask";
  if (i.privacy === "unknown" && onPrivateByDefaultSite(i.url)) return "ask";
  return "normal";
}
