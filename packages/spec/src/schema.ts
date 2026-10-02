import { z } from "zod";
import {
  ACTIONS,
  CARD_LIMITS,
  CONSENT_SCOPES,
  DOMAINS,
  EDGE_SOURCES,
  ENCOUNTER_FLAGS,
  ENVELOPE_VERSION,
  RELS,
  SENSITIVITIES,
  TIERS,
} from "./constants";

export const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const deviceIdSchema = z.string().regex(/^(dev|svc)_[0-9a-f]{4,32}$/);
const nameSchema = z.string().min(1).max(CARD_LIMITS.maxNameLength);
const sourceIdSchema = z.string().min(1).max(2048);

export const sourceSeenPayload = z.object({
  source_id: sourceIdSchema,
  ids: z.object({
    arxiv: z.string().max(64).optional(),
    doi: z.string().max(256).optional(),
    url: z.string().max(2048).optional(),
  }),
  title: z.string().max(500),
  license: z.string().max(64),
  sensitivity: z.enum(SENSITIVITIES),
  /** Set when the reader chose the sensitivity. Only such an event can make a sensitive source normal again. */
  by_user: z.boolean().optional(),
});

export const conceptCreatedPayload = z.object({
  concept_id: ulidSchema,
  canonical_name: nameSchema,
  aliases: z.array(nameSchema).max(32),
  domain: z.enum(DOMAINS),
});

export const conceptAliasAddedPayload = z.object({ concept_id: ulidSchema, alias: nameSchema });
export const conceptMergedPayload = z.object({ from: ulidSchema, into: ulidSchema });
export const conceptMutePayload = z.object({ concept_id: ulidSchema });

export const locatorSchema = z.object({
  exact: z.string().max(500),
  prefix: z.string().max(64),
  suffix: z.string().max(64),
  section: z.string().max(200).optional(),
});

export const explanationSchema = z.object({
  text: z.string().max(CARD_LIMITS.maxExplanationLength),
  tier: z.enum(TIERS),
  evidence_span: z.string().max(CARD_LIMITS.maxEvidenceLength).nullable(),
  model: z.string().max(CARD_LIMITS.maxModelNameLength),
});

export const encounterCreatedPayload = z.object({
  encounter_id: ulidSchema,
  concept_id: ulidSchema,
  source_id: sourceIdSchema,
  locator: locatorSchema,
  selection: z.string().min(1).max(CARD_LIMITS.maxSelectionLength),
  explanation: explanationSchema,
  flags: z.array(z.enum(ENCOUNTER_FLAGS)).max(4),
});

export const encounterActionPayload = z.object({
  encounter_id: ulidSchema,
  action: z.enum(ACTIONS),
  detail: z
    .object({ question: z.string().max(2000).optional(), answer: z.string().max(CARD_LIMITS.maxExplanationLength).optional() })
    .optional(),
});

export const encounterDeletedPayload = z.object({ encounter_id: ulidSchema });

export const edgeProposedPayload = z.object({
  from: ulidSchema,
  to: ulidSchema,
  rel: z.enum(RELS),
  source: z.enum(EDGE_SOURCES),
  confidence: z.number().min(0).max(1),
  evidence: z.object({ encounter_id: ulidSchema.optional() }),
});

export const edgeStatusPayload = z.object({ edge_id: z.string().min(1).max(200) });

export const contributionConsentPayload = z.object({
  scope: z.enum(CONSENT_SCOPES),
  target: z.string().max(512).nullable(),
});

const envelope = {
  v: z.literal(ENVELOPE_VERSION),
  id: ulidSchema,
  device: deviceIdSchema,
  seq: z.number().int().min(0),
  ts: z.iso.datetime(),
  enc: z.literal("none"),
};

function ev<const T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({ ...envelope, type: z.literal(type), payload });
}

export const eventSchema = z.discriminatedUnion("type", [
  ev("source.seen", sourceSeenPayload),
  ev("concept.created", conceptCreatedPayload),
  ev("concept.alias_added", conceptAliasAddedPayload),
  ev("concept.merged", conceptMergedPayload),
  ev("concept.muted", conceptMutePayload),
  ev("concept.unmuted", conceptMutePayload),
  ev("encounter.created", encounterCreatedPayload.nullable()),
  ev("encounter.action", encounterActionPayload.nullable()),
  ev("encounter.deleted", encounterDeletedPayload),
  ev("edge.proposed", edgeProposedPayload),
  ev("edge.confirmed", edgeStatusPayload),
  ev("edge.rejected", edgeStatusPayload),
  ev("contribution.consent", contributionConsentPayload),
]);

export type HarkEvent = z.infer<typeof eventSchema>;
export type EventType = HarkEvent["type"];
export type EventOf<T extends EventType> = Extract<HarkEvent, { type: T }>;
export type PayloadOf<T extends EventType> = EventOf<T>["payload"];
export type Locator = z.infer<typeof locatorSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
export type SourceIds = z.infer<typeof sourceSeenPayload>["ids"];
