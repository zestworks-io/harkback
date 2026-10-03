# Harkback privacy policy

_Last updated: 2026-10-01_

The published copy is at https://zestworks-io.github.io/harkback/privacy/ (source: [`site/privacy`](site/privacy/index.html), [`site/zh/privacy`](site/zh/privacy/index.html)). Keep them in sync.

Harkback is a browser extension that explains terms while you read and remembers what you understood. It has no server of its own. The developer does not receive, store or see any of your data.

## What Harkback stores

- **Your records** (explanations, follow-up questions, notes, "got it / still confused" marks, and the sources they came from) are stored in your browser, in the extension's local storage. They are never sent to the developer.
- **Your settings**, including any model API key you enter, are stored in the extension's storage in your browser. Keys are **not encrypted**. They are only sent to the model address you entered.
- **Backups.** Once a week Harkback saves a JSONL file with your records to `Downloads/harkback` on your computer. It contains records only, never settings or API keys. You can also export your data yourself from the library page.

## What leaves your browser

Only the request you trigger. When you ask for an explanation, Harkback sends the selected text, its paragraph, the section and the page title to the **model service you configured** (for example a hosted API or a local server such as Ollama). That service handles the data under its own terms and privacy policy. Content from sources you mark as sensitive is never sent to a non-local model.

Scanned PDFs are read on your computer: the page images never leave it. The one network request OCR can make is downloading a language pack (English is built in) from `cdn.jsdelivr.net`, once, and only when you install a language under Languages. That request carries no document content, and the pack is checked against a checksum shipped with Harkback before it is used.

Harkback does not include analytics, advertising or tracking, and does not sell or share your data.

## Permissions

- **Site access (optional).** Harkback asks for access to a website only when you choose to scan it or add it to the allowed list, and it asks for your model's address so it can send your requests. On arxiv.org it runs automatically.
- **Local files (optional).** To read a PDF on your computer, you can allow access to local files. The file is read in your browser and is never uploaded.
- **Other permissions.** `storage` keeps your records and settings; `alarms` schedules the weekly backup and refreshes the review count on the toolbar icon; `downloads` writes that backup; `offscreen` creates the backup file; `scripting` and `activeTab` let the toolbar button read the page you are on; `contextMenus` adds "Explain with Harkback" to the right-click menu of selected text.

## Private windows

Private (incognito) windows are off by default. When you enable them, Harkback explains but does not record, scan or show reminders.

## Deleting your data

Delete records from the library page, or remove the extension to clear everything it stores in your browser. Backups and exports already saved to your disk are yours to delete.

## Contact

Questions: open an issue at https://github.com/zestworks-io/harkback/issues.
