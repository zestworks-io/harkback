# Contributing

Thanks for helping improve Harkback.

## Setup

Node 22 or newer and pnpm. Run `pnpm install`, then see the README for building and loading the extension.

## Before you open a pull request

Run all of these; they must pass:

```sh
pnpm typecheck
pnpm test
pnpm format:check
pnpm e2e            # when you touch anything under apps/extension
pnpm check:build    # when you touch permissions, the manifest, or imports of the content script
```

## Guidelines

- **Keep `packages/core` and `packages/spec` free of browser APIs.** They run in tests without a DOM and must stay portable.
- **The event log is append-only and versioned.** Changing the shape of an event needs a schema change in `packages/spec` (regenerate the JSON schema with `pnpm --filter @harkback/spec gen:schema`) and a replay test.
- **Untrusted input.** Page text and model output are untrusted. Render them as text or through the restricted Markdown renderer, never as HTML, and keep them inside the delimiters used by the prompts.
- **Privacy rules are behavior, not copy.** If you change what is sent to a model, what a private window records, or how sensitive sources are routed, update the tests and `apps/extension/src/lib/pages/privacy.ts` together.
- **Tests.** Put pure logic in `packages/core` or `apps/extension/src/lib` with a unit test. Use an end-to-end test for anything that crosses the content script, the background page and storage.
- **No dead code.** Remove what you stop using; keep exports to what other modules need.
- **Commits.** Small, focused, with a message that describes the behavior change.

## Reporting bugs

Include the browser version, what you selected, what you expected and what happened. Do not paste API keys or private page content.
