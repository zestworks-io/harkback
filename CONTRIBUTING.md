# Contributing

Thanks for helping improve Harkback.

## Setup

Node 22 or newer and pnpm. Run `pnpm install`, then see the README for building and loading the extension.

`pnpm install` also installs a pre-commit hook (`.githooks/pre-commit`) that checks staged files with Prettier and ESLint. Fix formatting with `pnpm format`.

## Where things are

Start with [guide/architecture.md](guide/architecture.md): it explains the pieces, the flow of an explanation, replay and the security model. The other pages in [guide/](guide/README.md) describe the product and the [data format](guide/data-format.md). Keep them in step with the code: a change that alters behavior a page describes updates that page, and every user-visible change gets a line under _Unreleased_ in [CHANGELOG.md](CHANGELOG.md).

Tests:

| Where                 | What                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/*/test`     | Pure logic, including property tests for replay.                                                                      |
| `apps/extension/test` | Everything in `src/lib`, in the same folders; a browser-like DOM comes from happy-dom, IndexedDB from fake-indexeddb. |
| `apps/extension/e2e`  | The real extension in Chromium against a stub model server and HTML fixtures.                                         |

`pnpm exec playwright install chromium` once, then `pnpm e2e`. Run a single file with `pnpm exec vitest run path/to/file.test.ts`, or with `npx playwright test e2e/file.spec.ts` from `apps/extension`.

## Before you open a pull request

Run all of these; they must pass:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm e2e            # when you touch anything under apps/extension
pnpm check:build    # when you touch permissions, the manifest, or imports of the content script
```

The ESLint setup lives in `tools/lint` with its own TypeScript 6, because typescript-eslint does not support TypeScript 7 yet; the rest of the repo compiles with TypeScript 7.

## Guidelines

- **Keep `packages/core` and `packages/spec` free of browser APIs.** They run in tests without a DOM and must stay portable.
- **The event log is append-only and versioned.** Changing the shape of an event needs a schema change in `packages/spec` (regenerate the JSON schema with `pnpm --filter @harkback/spec gen:schema`) and a replay test.
- **Untrusted input.** Page text and model output are untrusted. Render them as text or through the restricted Markdown renderer, never as HTML, and keep them inside the delimiters used by the prompts.
- **Privacy rules are behavior, not copy.** If you change what is sent to a model, what a private window records, or how sensitive sources are routed, update the tests and `apps/extension/src/lib/pages/privacy.ts` together.
- **Tests.** Put pure logic in `packages/core` or `apps/extension/src/lib` with a unit test. Use an end-to-end test for anything that crosses the content script, the background page and storage.
- **No dead code.** Remove what you stop using; keep exports to what other modules need.
- **Commits.** Small, focused, with a message that describes the behavior change.

## Recipes

### Adding a model provider

Add an entry to `PROVIDERS` in `apps/extension/src/lib/models/providers.ts`. If the service speaks the OpenAI chat-completions format, that is all. If not, add an adapter in `lib/models/model-client.ts` (URL, headers, request body, how to read a streamed chunk and a whole reply) and tests with a fake `fetch` in `test/model-client.test.ts`. Also list it in the README table and [guide/models.md](guide/models.md).

### Adding a language

The interface language and the explanation language are separate lists.

1. **Interface:** add the code to `UI_LANGUAGES` in `lib/ui/languages.ts`. Create `lib/ui/locales/ui/<code>.ts` (the explain card and reunion text, one entry per key of `strings.ts`) and `lib/ui/locales/pages/<code>.ts` (the settings, history and onboarding text, keyed by the English sentence), and register both in the `index.ts` beside them.
2. **Explanations:** the language must also be in `EXPLAIN_LANGUAGES` in `packages/core/src/llm/languages.ts`.
3. Run `pnpm test`: `test/locales.test.ts` lists every sentence that is missing, unused or has different `{placeholders}`.

New English text in a page is written as `L("中文", "English")` or `pick(lang, zh, en)`; the test then requires a translation in every table.

### Adding an event type or field

Change `packages/spec/src/schema.ts`, regenerate the schema with `pnpm --filter @harkback/spec gen:schema`, handle it in `packages/core/src/events/replay.ts` and add a replay test. New optional fields keep old logs valid. A change that old versions cannot read needs a new envelope version `v`.

### Adding a setting

Add it to the `Settings` type, `DEFAULT_SETTINGS`, `withDefaults` (so stored settings without it still load) and, if it can be invalid, `validateSettings`. Then add the control in `entrypoints/options/main.ts`, and test `withDefaults` for the stored shape.

### Adding a request between pages and the background

Add it to `Request`, `ResponseMap` and `REQUEST_TYPES` in `lib/messaging/messages.ts`, handle it in `lib/messaging/requests.ts` with a test, and decide who may send it in `lib/messaging/sender-auth.ts`. Anything that writes or deletes is for extension pages only.

## Releasing

1. Move the _Unreleased_ entries in [CHANGELOG.md](CHANGELOG.md) under a new version heading with the date.
2. Bump `version` in `apps/extension/package.json`.
3. `pnpm release` runs every check, builds the production extension, verifies the package and writes `apps/extension/.output/harkback-<version>-chrome.zip`.
4. Tag the commit `v<version>` and attach the zip.

If a release changes permissions, update `PRIVACY.md`, the website's privacy pages and `store/privacy-practices.md` together.

## Reporting bugs

Include the browser version, what you selected, what you expected and what happened. Do not paste API keys or private page content.
