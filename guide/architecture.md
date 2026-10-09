# Architecture

Harkback is a Chrome extension (Manifest V3, built with [WXT](https://wxt.dev)) on top of a small, browser-free core library. This page explains how the pieces fit and why.

## The idea in one paragraph

Everything the user does is an **event** in an append-only log. **Concepts, aliases, merges, encounters and relations are never stored**: they are derived by replaying the log. So a better matching rule improves old records, a merge is just another event, and the log is a complete, portable copy of what you know.

## Repository layout

| Path             | Role                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/spec`  | The event format: constants, [zod](https://zod.dev) schemas, parsing, and the generated JSON schema.                                                                      |
| `packages/core`  | Pure logic with no DOM or extension APIs: replay, name normalization, concept matching, reunion selection, prompts, output parsing, JSONL and Markdown export, redaction. |
| `apps/extension` | The extension: entrypoints in `src/entrypoints`, everything testable in `src/lib`, tests in `test/` and `e2e/`.                                                           |
| `tools/lint`     | ESLint, with its own TypeScript version.                                                                                                                                  |
| `site`, `store`  | The public website and the Chrome Web Store text.                                                                                                                         |
| `guide`          | This documentation.                                                                                                                                                       |

Inside `packages/core/src`, a folder holds one kind of logic, and `index.ts` re-exports all of it:

| Folder      | Holds                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `events/`   | The log and what it replays into: ids, ordering, the event factory, state, replay, compaction.        |
| `concepts/` | Names and matching: normalization, candidates, the page matcher, reunion selection.                   |
| `llm/`      | What is said to a model and what comes back: prompts, output parsing, evidence, recording, languages. |
| `review/`   | Review grades.                                                                                        |
| `export/`   | JSONL and Markdown export, redaction.                                                                 |

Inside `apps/extension/src/lib`, the same idea, by what the code is about. The tests under `apps/extension/test` have the same folders.

| Folder                                      | Holds                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `models/`                                   | Talking to a model: providers, the HTTP client and adapters, Chrome's built-in model, routing, rate limit. |
| `review/`                                   | The review schedule: FSRS, due dates, order, prerequisite gaps, the toolbar badge, "check my answer".      |
| `records/`                                  | Views of what was recorded: concept pages, names, graph, history, digest, reunion cards.                   |
| `explain/`                                  | Turning a selection or a page into a request for a model: the plan, the page preview.                      |
| `source/`                                   | Where the text comes from: page extraction, source ids, site rules.                                        |
| `storage/`                                  | The event store, its cache, backups and settings.                                                          |
| `messaging/`                                | The messages between content script, background and pages, and who may send which.                         |
| `export/`                                   | Anki and note-folder export.                                                                               |
| `content/`, `ui/`, `pages/`, `pdf/`, `ocr/` | The content script, its shadow-DOM interface, the logic of the extension pages, the PDF reader, OCR.       |

Keep `packages/core` and `packages/spec` free of browser APIs. They run in plain Node tests and must stay portable.

## Runtime pieces

```
┌────────────────────┐   port "explain"     ┌─────────────────────────────┐
│ content script      │ ───────────────────▶ │ background service worker    │
│  extract page text  │ ◀─────────────────── │  site rules → choose model   │
│  selection + card   │   streamed events    │  rate limit → stream reply   │
│  reunion underlines │                      │  parse → resolve concept     │
│  (closed shadow DOM)│   runtime messages   │  append events (IndexedDB)   │
└────────────────────┘ ───────────────────▶ └──────────────┬──────────────┘
                                                             │ BroadcastChannel
┌────────────────────┐   runtime messages                   ▼
│ library / options / │ ───────────────────▶   other extension pages refresh
│ onboarding / reader │ ◀── reads IndexedDB directly ───────────────────────
└────────────────────┘
```

- **Content script** (`entrypoints/content.ts`, `lib/content/app.ts`). Declared only for `https://arxiv.org/*`; other pages get it by programmatic injection after a click, the shortcut, the context menu, or when the user allows the site. It extracts the readable text (LaTeXML structure on arXiv, Readability elsewhere) with a map from text offsets back to DOM nodes (`lib/source/extract.ts`), tracks the selection, draws the explain card and the reunion underlines inside a **closed shadow root**, and watches the page for changes. It never talks to a model.
- **Background service worker** (`entrypoints/background.ts`). The only place that calls models, writes the log, runs backups and registers content scripts. One long-lived **port** per card carries the explanation (`start`, `answer`, `followup`, `cancel`, `ping` in; `delta`, `explained`, `ask`, `done`, `followup_*`, `error` out). The content script pings every 20 seconds to keep the worker alive during a stream. The built-in model is a provider whose address is `chrome-ai://prompt-api`: `isLocalUrl` treats it as this computer, and `streamChat` hands it to `lib/models/builtin-ai.ts`, which calls Chrome's Prompt API (`LanguageModel`) directly, with no HTTP and no offscreen page. One-shot requests (`lib/messaging/messages.ts`) cover everything else, including the page preview: `preview-plan` says which model a scan would use, so the panel can name it before anything is sent; `preview-terms` asks one model call for the page's key terms (`buildTermsPrompt`, `parseTerms` in `packages/core`) and `lib/explain/preview.ts` sorts them against the records locally; `preview-explain` returns a stored explanation or a model-written one. Neither writes events, and the model never receives the concept list.
- **Offscreen document** (`entrypoints/offscreen`). Builds the blob URL for a backup download, which a service worker cannot do.
- **Extension pages**: `library` (History, Review, Graph), `options`, `onboarding`, `reader` (PDF). They read IndexedDB directly and send writes to the background as requests, so every write goes through one path.

### Who may ask for what

`lib/messaging/sender-auth.ts` classifies each sender as `content` (a content script, identified by its tab), `page` (an extension page, identified by its URL) or `reader` (the reader page, which acts for the PDF it shows). Destructive and bulk requests (`delete-encounter`, `merge-concepts`, `import-events`, `mark-normal`, `backup-now`, …) are accepted from `page` only. A web page cannot reach any of this: the extension exposes no web-accessible resources and no external messaging.

## An explanation, step by step

1. The content script builds an `ExplainRequestMsg`: selection, paragraph (windowed around the selection), section, title, source id, locator.
2. The background routes it (`lib/explain/explain.ts`, `lib/models/model-policy.ts`): the site rule (disabled? sensitive? which model?), the model the user picked after a failure, and the sensitivity of the source. Sensitive sources may only use a local model.
3. It checks that Chrome granted the model's address, takes a slot from the local rate limiter, and streams the reply (`lib/models/model-client.ts`). Three adapters (OpenAI-compatible, Anthropic, Gemini) turn each service's stream into text. A stream only counts as complete if the service says it finished.
4. `parseModelOutput` (`packages/core/src/llm/parse-output.ts`) reads the three blocks `<explanation>`, `<evidence>`, `<card>` and tolerates truncation, trailing commas and decorated labels. `verifyEvidence` checks the quote against the page text and decides the tier: _defined in source_ or _external knowledge_.
5. `resolveConcept` decides whether the term is a known concept: the model may name a candidate (`c1`), or the best candidate may be close enough that the user is asked.
6. `buildRecordEvents` (`packages/core/src/llm/record.ts`) turns the result into events: `source.seen`, `concept.created` or `concept.alias_added`, `encounter.created`, `edge.proposed` for the model's relations. Every event is validated against the schema before it is written.
7. The write is serialized with others (`inRecordingOrder`), so two tabs cannot both create the same concept. It happens in one IndexedDB transaction with the device's sequence counter.
8. The change is announced on a `BroadcastChannel`; open pages refresh, and the badge is recomputed shortly after.

## Replay

`replay(events)` (`packages/core/src/events/replay.ts`):

1. Puts events in a canonical order (timestamp, device, sequence, id) and drops duplicates by id.
2. `resolveConcepts` unions concepts that are the same: explicit merges, equal canonical names in a domain, aliases that equal another concept's name, and an abbreviation with its single full name. Union-find keeps the smallest id as representative.
3. Folds sources (sensitive is sticky unless an event carries `by_user`), encounters (minus deleted ones), actions, mutes and edges into a `State`.

Matching on a page (`matcher.ts`) is Aho-Corasick over every alias, after folding compatibility forms, accents, separators and Greek letter names. `reunion.ts` then applies the rules that keep reunions useful; they are listed in the [user guide](user-guide.md#reunions).

Because replay is a pure function of the log, it is easy to test, including with property tests (`packages/core/test/replay.property.test.ts`).

## Storage

- **IndexedDB `harkback`**: object store `events` (key `id`, unique index on `[device, seq]`) and `meta` (device identity and sequence counter). If the counter is behind the log, a new device id is generated, so an `[device, seq]` clash is impossible.
- **`chrome.storage.local`**: settings and backup bookkeeping. **`chrome.storage.session`**: the rate limiter's timestamps.
- **IndexedDB `harkback-pdf`**: a short-lived hand-off of a downloaded PDF to the reader page.
- **IndexedDB `harkback-ocr`**: downloaded OCR language packs, the text read from scanned pages (keyed by source, page and languages) and the languages chosen per document. All of it can be fetched or computed again, so it is not backed up. The OCR engine's own cache (`keyval-store`) only holds copies of the packs for the worker to load.

Deleting an encounter appends `encounter.deleted`, then `compact()` rewrites the deleted encounter's payloads to `null` in place. Ids, order and tombstones stay, so the log remains valid.

## Security model

- Page text and model output are **untrusted**. They are only ever put in the DOM as text or through `lib/ui/markdown.ts`, which builds elements itself (no HTML, no images, links need a confirmation click). There is no `innerHTML` in the extension.
- Prompts wrap page-derived text in delimiters, strip those delimiters from it repeatedly, and tell the model not to follow instructions inside.
- The model's card cannot reference anything but candidates that were offered to it; names containing `<`, `>` or newlines are discarded.
- All model URLs pass `modelUrlError`: `http(s)` only, and plain `http` only for this computer or the user's own network.
- Host access is optional and requested one site at a time. The only automatic content script is for arxiv.org.
- UI inside pages lives in a closed shadow root, and the production build is checked for that (`apps/extension/test/manifest.test.ts`).

Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).

## Where to change things

| You want to…                      | Look at                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a model provider              | `lib/models/providers.ts` (and an adapter in `lib/models/model-client.ts` if its format is new)                                                    |
| Change how names are matched      | `packages/core/src/concepts/normalize.ts`, `matcher.ts`, and `events/replay-concepts.ts`                                                           |
| Change reunion rules              | `packages/core/src/concepts/reunion.ts`, `packages/core/src/constants.ts`                                                                          |
| Change the prompt or reply format | `packages/core/src/llm/prompt.ts`, `parse-output.ts`                                                                                               |
| Change the review schedule        | `lib/review/review.ts` (replay), `lib/review/fsrs.ts` (the memory model), `lib/review/prerequisites.ts` (order), `lib/review/foundation.ts` (gaps) |
| Add an event type or field        | `packages/spec/src/schema.ts`, then `packages/core/src/events/replay.ts`; regenerate the schema                                                    |
| Add a page setting                | `lib/storage/settings.ts` (type, default, `withDefaults`, `validateSettings`), then `entrypoints/options`                                          |
| Add a language                    | see [CONTRIBUTING](../CONTRIBUTING.md#adding-a-language)                                                                                           |
