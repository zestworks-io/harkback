import { ENVELOPE_VERSION, LIMITS } from "./constants";
import { eventSchema, type HarkEvent } from "./schema";

export type ParseEventResult = { kind: "event"; event: HarkEvent } | { kind: "future"; raw: unknown } | { kind: "invalid"; reason: string };

const encoder = new TextEncoder();

export function utf8Length(s: string): number {
  return encoder.encode(s).length;
}

export function parseEvent(raw: unknown): ParseEventResult {
  if (utf8Length(JSON.stringify(raw) ?? "") > LIMITS.maxEventBytes) return { kind: "invalid", reason: "too_large" };
  if (typeof raw === "object" && raw !== null) {
    const v = (raw as { v?: unknown }).v;
    if (typeof v === "number" && v > ENVELOPE_VERSION) return { kind: "future", raw };
  }
  const result = eventSchema.safeParse(raw);
  if (result.success) return { kind: "event", event: result.data };
  return { kind: "invalid", reason: result.error.issues[0]?.message ?? "schema" };
}
