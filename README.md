# Harkback

A browser extension that explains terms while you read, remembers what you understood, and reconnects you with those explanations when you meet the same term again.

- **Explain**: select a term (or press `Alt+E`) and get a short explanation from the model you configure, marked as _defined in source_ or _external knowledge_.
- **Remember**: every explanation is stored as an append-only event log in the browser (IndexedDB). Nothing is sent anywhere except the model request you trigger.
- **Reunion**: on later pages, terms you have looked up are underlined; hover to see what you understood before.
- **Private by default**: pages are scanned automatically only on arxiv.org. Sensitive sites can be forced onto a local model such as Ollama, and private windows never record or scan.

Explanations work with any OpenAI-compatible chat API (Ollama, OpenAI, OpenRouter, and others). API keys are stored unencrypted in the extension's storage.

## Repository layout

| Path             | What it is                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/spec`  | The event format: constants, zod schemas, and the generated JSON schema.                                                  |
| `packages/core`  | Pure logic with no browser dependencies: replay, concept matching, reunion selection, prompts, JSONL and Markdown export. |
| `apps/extension` | The Chrome extension, built with [WXT](https://wxt.dev).                                                                  |

## Getting started

Requires Node 22 or newer and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm --filter @harkback/extension build   # output in apps/extension/.output/chrome-mv3
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3`. The onboarding page opens on install.

For development with live reload, run `pnpm --filter @harkback/extension dev`.

## Checks

```sh
pnpm typecheck     # all packages
pnpm test          # unit tests
pnpm check:build   # production build: manifest permissions and content-script size
pnpm e2e           # end-to-end tests in Chromium (run `pnpm exec playwright install chromium` once)
pnpm format:check  # formatting
```

The end-to-end tests load the built extension into Chromium, serve arXiv pages from `apps/extension/fixtures`, and talk to a local stub model server. See `apps/extension/e2e`.

## Data and privacy

The privacy notes shown in the extension are the source of truth: `apps/extension/src/lib/pages/privacy.ts`. A weekly JSONL backup of your records (never settings or API keys) is written to `Downloads/harkback`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
