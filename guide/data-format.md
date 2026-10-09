# Data format

Your records are an **append-only log of events**. The same log is what Harkback keeps in IndexedDB, what it writes as a JSONL backup, and what you can import. Everything else (concepts, aliases, relations, the review queue, the graph) is derived from it.

- Schemas: [`packages/spec/src/schema.ts`](../packages/spec/src/schema.ts) and the generated [JSON schema](../packages/spec/schema/event.schema.json).
- Replay, matching and export: [`packages/core`](../packages/core), which has no browser dependencies and can be used on its own.

## JSONL

One event per line, UTF-8, no wrapping array. A backup is `Downloads/harkback/backup-<device>-<date>.jsonl`.

```json
{"v":1,"id":"01K…","device":"dev_7f3a…","seq":12,"ts":"2026-09-25T10:00:00.000Z","enc":"none","type":"encounter.created","payload":{…}}
```

Reading rules (`parseJsonl`):

- A line larger than 64 KB is skipped.
- A line that is not JSON is skipped; if it is the last line and has no newline, it is reported as a partial write.
- An event with an unknown `type` or a newer `v` is kept apart as _future_ and ignored, never an error.
- Everything else is validated against the schema; invalid events are skipped with a reason.

## Envelope

| Field    | Meaning                                                     |
| -------- | ----------------------------------------------------------- |
| `v`      | Format version. Currently `1`.                              |
| `id`     | A ULID, unique per event. Replay drops duplicates by id.    |
| `device` | `dev_` + hex, identifies the browser profile that wrote it. |
| `seq`    | Per-device counter. `(device, seq)` is unique.              |
| `ts`     | ISO-8601 timestamp.                                         |
| `enc`    | `"none"`. Reserved for encrypted payloads.                  |

Events are ordered by `ts`, then `device`, then `seq`, then `id`.

## Event types

| Type                                | Payload                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source.seen`                       | `source_id`, `ids` (`arxiv`, `doi`, `url`), `title`, `license`, `sensitivity` (`normal` / `sensitive`), optional `by_user`                                                                           |
| `concept.created`                   | `concept_id`, `canonical_name`, `aliases`, `domain`                                                                                                                                                  |
| `concept.alias_added`               | `concept_id`, `alias`                                                                                                                                                                                |
| `concept.merged`                    | `from`, `into`                                                                                                                                                                                       |
| `concept.muted` / `concept.unmuted` | `concept_id`                                                                                                                                                                                         |
| `encounter.created`                 | `encounter_id`, `concept_id`, `source_id`, `locator` (`exact`, `prefix`, `suffix`, `section`), `selection`, `explanation` (`text`, `tier`, `evidence_span`, `model`), `flags`; `null` after deletion |
| `encounter.action`                  | `encounter_id`, `action`, optional `detail` (`question`, `answer`); `null` after deletion                                                                                                            |
| `encounter.deleted`                 | `encounter_id`                                                                                                                                                                                       |
| `edge.proposed`                     | `from`, `to`, `rel`, `source`, `confidence`, `evidence` (`encounter_id`)                                                                                                                             |
| `edge.confirmed` / `edge.rejected`  | `edge_id` (`<from>><rel>><to>` of the representatives)                                                                                                                                               |
| `contribution.consent`              | Reserved.                                                                                                                                                                                            |

Enumerations:

- `domain`: `ml`, `systems`, `networking`, `security`, `data`, `math`, `physics`, `bio`, `other`
- `tier`: `defined_in_source`, `external_knowledge`
- `action`: `followed_up`, `marked_understood`, `marked_confused`, `reunion_recalled`, `reunion_reexplain`, `reunion_compare`, `review_again`, `review_hard`, `review_good`, `review_easy` (the four review grades; older marks count as Good for `marked_understood` and `reunion_recalled`, and as Again for `marked_confused`, except a `marked_*` made less than a day after the look-up, which is the explain-card mark and not a review)
- `rel`: `variant_of` (from is a variant or kind of to), `prerequisite` (from requires to first), `related`
- edge `source`: `llm_explain`, `cooccurrence`, `user`, plus reserved external ones

Limits: names ≤ 80 characters, ≤ 8 aliases, selection ≤ 200, explanation ≤ 20,000, evidence ≤ 1,000, an event ≤ 64 KB.

## Source ids

A source is identified, in this order, by `arxiv:<id>`, `doi:<doi>`, or `url:<canonical or cleaned URL>` (tracking parameters and the fragment removed). A local PDF is identified by `pdf:sha256:<hash>`, and its path is never recorded.

## Replay rules worth knowing

- **Concepts that are the same are merged by replay**, not by an event: equal names within a domain, a name that is another concept's alias, an abbreviation and its single full name (three or more words). Explicit `concept.merged` events are applied too.
- **Sensitive is sticky.** A later `source.seen` with `sensitivity: "normal"` is ignored unless it has `by_user: true`.
- **Deleting is a tombstone.** `encounter.deleted` hides the encounter; compaction clears the payloads of the encounter and its actions to `null`.
- **Edges** are keyed by `(from, rel, to)` of the representatives; repeated proposals merge, taking the highest confidence. An edge below confidence 0.7 is not shown unless confirmed.
- **Unknown references** (an action for an encounter you do not have, an alias for an unknown concept) are ignored. Some are listed in `state.warnings`.

## Importing

**History → Import JSONL** parses the file, then adds every event whose `id` is not already present (and whose `(device, seq)` is free). Nothing is rewritten, so importing is safe to repeat. Events written by this browser's own earlier life (for example after reinstalling) move the sequence counter forward, so new events never clash with them.

## Using the library without the extension

```ts
import { parseJsonl, replay, exportMarkdown } from "@harkback/core";

const { events } = parseJsonl(await fs.readFile("backup.jsonl", "utf8"));
const state = replay(events);
for (const c of state.concepts.values()) console.log(c.canonicalName, c.names);
console.log(exportMarkdown(state, "en"));
```

`withoutSensitive(events)` returns the log without sensitive sources and the concepts known only from them.

## Other exports

- **Markdown**: one file; concepts, encounters, dates, tiers, sources.
- **Notes folder** (Obsidian): `Harkback/<Concept>.md` with YAML front matter (`aliases`, `domain`, `status`), `[[wiki links]]` for prerequisites, variants and related concepts, and a timeline. The line `<!-- harkback:end … -->` ends the generated part; everything below it is yours and survives re-export.
- **Anki**: tab-separated text with `#separator:tab`, `#html:true`, `#tags column:3` headers. Front: the name and other names. Back: the latest explanation, the quote and the source. Tags: `harkback`, the domain, and your understanding.
