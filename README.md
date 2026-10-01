# Harkback

**English** · [简体中文](README.zh-CN.md)

**Explain terms while you read. Remember what you understood. Get it back when you meet the term again.**

Harkback is a Chrome extension for people who read papers and technical documents. Select a term and it explains the term in context. Every explanation is kept in a local, append-only log. When the same term shows up on a later page, even under another spelling, Harkback underlines it and shows what you understood last time.

> "harken back": to return to an earlier point.

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Install](#install)
- [Connect a model](#connect-a-model)
- [Using Harkback](#using-harkback)
- [Privacy](#privacy)
- [Your data](#your-data)
- [Limitations](#limitations)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Explain in context.** Select a term, click _Explain_ or press `Alt+E`. The answer streams in from the model you configured and is marked _defined in source_ (the page defines the term, and the quote is verified against the page text) or _external knowledge_.
- **Remember.** Each explanation, follow-up question and "got it / still confused" mark is stored as an event in IndexedDB. Nothing leaves your browser except the model request you trigger.
- **Reunions.** On later pages, terms you have looked up are underlined. Hover to see when and where you met the term and what you understood, then mark it remembered, explain it again, compare the two usages, or mute it.
- **One concept, many spellings.** `LLM`, `LLMs`, `the LLM`, `large language model` and `Large-Language Models` are the same concept. So are `β-VAE` and `beta-VAE`, and `fine-tuning` and `ﬁne-tuning` with a ligature. Near matches are put to you as "is this the term you looked up 3 days ago?".
- **Related terms.** If a model says `QLoRA` is a variant of `LoRA`, a page that only mentions `QLoRA` reminds you of what you understood about `LoRA`.
- **Concept pages.** Open any term in History to see how well you understood it, what it builds on (prerequisites), its variants and related terms, and every time you met it. You can add an alias, merge two concepts that are the same, remove a wrong relation, or mute a term.
- **Review.** History shows a _Review_ button with the number of terms due. Terms you were confused about come back after a day; terms you remembered come back after 3, 7, 14, 30 and 60 days. The toolbar icon shows the same number.
- **Builds on what you know.** When a term you look up is close to one you already understand, the model is told so and can explain the difference instead of starting over.
- **Private by design.** Automatic scanning is limited to arxiv.org. Sensitive sites can be forced onto a local model, and private windows never record or scan.
- **Portable records.** Export everything as Markdown, or as a folder of linked notes (one file per concept with `[[links]]`, ready for Obsidian), or as a versioned JSONL event log with a published JSON schema. A weekly JSONL backup is written to `Downloads/harkback`.
- **Any OpenAI-compatible model.** Ollama, OpenAI, OpenRouter, Anthropic's compatible endpoint, or your own server.

## How it works

```
 read                explain                 remember                 recall
 ────                ───────                 ────────                 ──────
 content script  →   background worker   →   append-only event log →  matcher scans the next page
 extracts page       routes to a model       (IndexedDB), replayed      for known names, picks the
 text, tracks        by site sensitivity,    into concepts, aliases     concepts worth showing, and
 your selection      streams the answer,     and encounters             draws the underline + card
                     resolves the concept
```

1. **Read.** A content script extracts the readable text of the page (LaTeXML structure on arXiv, Readability elsewhere) and keeps a map from text offsets back to DOM nodes.
2. **Explain.** The background worker checks the site rules, picks a model, applies a local rate limit, and sends the term with its paragraph. The prompt lists known concepts as candidates so the model can say "this is the same concept as c1". The reply is parsed defensively: truncated cards, trailing commas and decorated labels are tolerated.
3. **Remember.** The result becomes events (`concept.created`, `encounter.created`, `edge.proposed`, ...). Concepts, aliases and merges are derived by replaying the log, never stored, so a better matching rule improves old records too.
4. **Recall.** On each page an Aho-Corasick matcher scans the text for every known name and abbreviation. Reunion selection then applies the rules that keep it useful: not on the page where you looked the term up, not within a minimum gap, muted concepts stay muted, and an ambiguous abbreviation needs a second term from the same field on the page.

## Install

Requires Node 22 or newer and [pnpm](https://pnpm.io). There is no store listing yet, so load the extension from source:

```sh
# from the repository root
pnpm install
pnpm --filter @harkback/extension build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3`. The onboarding page opens on install.

## Connect a model

Onboarding walks you through this, and you can change it later on the settings page.

| Provider   | Base URL                       | Notes                                 |
| ---------- | ------------------------------ | ------------------------------------- |
| Ollama     | `http://127.0.0.1:11434/v1`    | Local, no key. See below.             |
| OpenAI     | `https://api.openai.com/v1`    | Needs an API key.                     |
| OpenRouter | `https://openrouter.ai/api/v1` | Needs an API key.                     |
| Anthropic  | `https://api.anthropic.com/v1` | Needs an API key.                     |
| Custom     | any `/v1` endpoint             | Non-local addresses must use `https`. |

Chrome asks you to allow access to the model's address the first time you test or save it. If you decline, the explain card says so instead of failing with a network error.

**Ollama** rejects requests from browser extensions unless the extension's origin is allowed. The _Test connection_ button shows the exact command for your system, for example on macOS:

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<your-extension-id>"
```

then restart Ollama.

## Using Harkback

| You want to                       | Do this                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Explain a term                    | Select it and click **Explain**, or press `Alt+E`.                                             |
| Ask more                          | Use **Ask more** on the card. The question and answer are saved with the explanation.          |
| Scan a page that is not on arXiv  | Click the toolbar button, or allow the site under _Sites_ in settings for automatic scans.     |
| Read a PDF                        | Click the toolbar button on the PDF: arXiv papers open as HTML, other PDFs open in the reader. |
| See what you have looked up       | Open the history page from the settings page or the onboarding page. It updates live.          |
| Keep your records                 | History page → **Export Markdown** or **Back up JSONL now**.                                   |
| Stop a term from being underlined | Hover the underline → **Don't show again**.                                                    |
| Keep a source off remote models   | Card → **Mark source as sensitive**, or add a sensitive rule for the site in settings.         |

## Privacy

- When you ask for an explanation, the selected text, its paragraph, the section and the page title go to the model service you configured, under that provider's terms.
- Records stay in this browser. Backups contain records only, never settings or API keys.
- Pages are scanned automatically only on arxiv.org. Anywhere else you must click the button, press `Alt+E`, or allow the site.
- Content from a sensitive source is never sent to a non-local model, including as context for later comparisons.
- Private windows explain but never record, scan or show reunions.
- Reunion underlines live in the page, so the page's own scripts may infer which terms you have records for.
- Deleting an explanation removes it in the app; traces may remain on disk and exported backups cannot be recalled.
- API keys are stored **unencrypted** in the extension's storage.

The notes shown in the extension are the source of truth: [`apps/extension/src/lib/pages/privacy.ts`](apps/extension/src/lib/pages/privacy.ts).

## Your data

Everything is an event in an append-only log. The format is public:

- Event types and payloads: [`packages/spec`](packages/spec), with the generated [JSON schema](packages/spec/schema/event.schema.json).
- Replay, matching and export: [`packages/core`](packages/core), which has no browser dependencies and can be used on its own.

Because concepts and aliases are derived from the log, your JSONL backup is a complete, portable copy of what you know.

## Limitations

- Chrome (Manifest V3) only.
- Explanations depend on the model you choose; small local models may produce weaker concept cards, which lowers recall quality but never breaks recording.
- Text in a browser's built-in PDF viewer cannot be read, so Harkback opens the PDF in its own reader page (arXiv papers go to the HTML version instead). Scanned PDFs have no text and are not supported, there is no OCR, and paragraph detection on complicated layouts (tables, figures with text, three or more columns) is approximate. A PDF on your computer needs "Allow access to file URLs" turned on for Harkback in `chrome://extensions`.
- Automatic abbreviation matching needs at least three words in the full name (`LLM` from `Large Language Model`). Two abbreviations that map to different full names in the same field (for example two different "GNN"s) are kept as separate concepts.
- Chinese, Japanese and Korean names must be at least three characters to be underlined, to avoid false positives.

## Repository layout

| Path             | What it is                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/spec`  | The event format: constants, zod schemas, and the generated JSON schema.                                                         |
| `packages/core`  | Pure logic: replay, name normalization, concept matching, reunion selection, prompts, output parsing, JSONL and Markdown export. |
| `apps/extension` | The Chrome extension, built with [WXT](https://wxt.dev): content script, background worker, history, settings and onboarding.    |
| `tools/lint`     | ESLint setup.                                                                                                                    |

## Development

```sh
pnpm install
pnpm --filter @harkback/extension dev     # live reload
```

Before opening a pull request:

```sh
pnpm typecheck     # all packages
pnpm lint          # ESLint
pnpm test          # unit tests
pnpm check:build   # production build: manifest permissions and content-script size
pnpm e2e           # end-to-end tests in Chromium (run `pnpm exec playwright install chromium` once)
pnpm format:check  # formatting
```

The end-to-end tests load the built extension into Chromium, serve arXiv pages from `apps/extension/fixtures`, and talk to a local stub model server. They cover the whole loop: reading a paper, explaining, recording, the history page, and reunions on other papers. See `apps/extension/e2e`.

## Contributing

Bug reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
