# Harkback privacy policy

_Last updated: 2026-10-20_

The published copy is at https://zestworks-io.github.io/harkback/privacy/ (source: [`site/privacy`](site/privacy/index.html), [`site/zh/privacy`](site/zh/privacy/index.html)). Keep them in sync.

Harkback is a browser extension that explains terms while you read and remembers what you understood. It has no server of its own. The developer does not receive, store or see any of your data.

## What Harkback stores

- **Your records** (explanations, follow-up questions, notes, "got it / still confused" marks, and the sources they came from, with a source's licence when the page states one) are stored in your browser, in the extension's local storage. They are never sent to the developer.
- **Your settings**, including any model API key and Zotero API key you enter, are stored in the extension's storage in your browser. Keys are **not encrypted**. A model key is only sent to the model address you entered, and a Zotero key only to `api.zotero.org`.
- **Backups.** Once a week Harkback saves a JSONL file with your records to `Downloads/harkback` on your computer. It contains records only, never settings or API keys. You can also export your data yourself from the library page.
- **Contribution file (optional).** If you choose _Contribute_ on the library page, Harkback builds an anonymous file from your look-ups in openly licensed arXiv and DOI papers: the paper id, its licence, the term, its field and section, how well you understood it and the month, plus the relations you confirmed. It has no quotes, explanations, addresses or exact times, and never includes a sensitive source. You see the whole file before you save it to your computer. Nothing is uploaded; whether and where you submit it is up to you. Saving adds a note to your records of what you agreed to contribute.

## What leaves your browser

Only the request you trigger. When you ask for an explanation, Harkback sends the selected text, its paragraph, the section and the page title to the **model service you configured** (for example a hosted API or a local server such as Ollama). That service handles the data under its own terms and privacy policy. Content from sources you mark as sensitive is never sent to a non-local model. The same is true of the optional "Check my answer" button in review: only when you press it, Harkback sends the term, the answer you typed and the stored explanation to your model. You can turn it off in settings. The same goes for the page preview: only when you press Scan, Harkback sends the page text (the first 16,000 characters) to your model, and a page you marked sensitive only uses a local model. Chrome's built-in model runs on your computer, so nothing is sent anywhere; Chrome itself downloads that model when you press Download model.

Scanned PDFs are read on your computer: the page images never leave it. The one network request OCR can make is downloading a language pack (English is built in) from `jsdelivr.net` (`cdn.jsdelivr.net`, or `fastly.jsdelivr.net` and `gcore.jsdelivr.net` if that cannot be reached), once, and only when you install a language under Languages. That request carries no document content, and the pack is checked against a checksum shipped with Harkback before it is used.

**Importing from Zotero (optional).** Only when you press _Find highlights_ under Settings → Data and privacy → Zotero, Harkback sends your Zotero API key to `api.zotero.org` and reads your highlights and the papers and files they belong to. Short highlights you keep ticked are recorded as look-ups with the paper's title and its arXiv id or DOI; a file that is not a published paper is recorded as a sensitive source. Nothing is written to your Zotero library, and nothing from your records is sent to Zotero. If you then press _Explain them with my model_ in History, each imported term and its paper's title are sent to the model your settings choose for that paper, and only to a local model for a sensitive source.

Harkback does not include analytics, advertising or tracking, and does not sell or share your data.

## Permissions

- **Site access (optional).** Harkback asks for access to a website only when you choose to scan it or add it to the allowed list, and it asks for your model's address so it can send your requests, and for `api.zotero.org` when you import from Zotero. On arxiv.org it runs automatically.
- **Local files (optional).** To read a PDF on your computer, you can allow access to local files. The file is read in your browser and is never uploaded.
- **Other permissions.** `storage` keeps your records and settings; `alarms` schedules the weekly backup and refreshes the review count on the toolbar icon; `downloads` writes that backup; `offscreen` creates the backup file; `scripting` and `activeTab` let the toolbar button and the keyboard shortcuts read the page you are on; `contextMenus` adds "Harkback: Explain" to the right-click menu of selected text, "Harkback: Preview this page" to the right-click menu of a page, and Review and History to the right-click menu of the toolbar icon.

## Private windows

Private (incognito) windows are off by default. When you enable them, Harkback explains but does not record, scan or show reminders.

## Deleting your data

Delete records from the library page, or remove the extension to clear everything it stores in your browser. Deleting an entry clears its text (the quote, the explanation and any follow-up); the term's name and the source's title and address stay in your records, because other entries may refer to them. Backups and exports already saved to your disk are yours to delete.

## Contact

Questions: open an issue at https://github.com/zestworks-io/harkback/issues.
