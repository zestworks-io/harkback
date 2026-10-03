# Troubleshooting

## The model does not answer

| What you see                                              | Cause and fix                                                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| "No model configured yet"                                 | Add one in settings (or finish onboarding).                                                                                             |
| "Access to the model address has not been granted"        | In settings press **Test** or **Save** and allow Chrome's prompt. Chrome asks once per address.                                         |
| "The model service rejected the request…"                 | Wrong or expired API key. For Ollama it usually means `OLLAMA_ORIGINS`; see [Models](models.md#ollama).                                 |
| "Cannot reach the model service"                          | Wrong address, service not running, or no network. For Ollama, make sure it is started.                                                 |
| "The model stopped responding"                            | No text for 2 minutes at the start or 30 seconds in the middle. Reasoning models can think a long time; try again or use another model. |
| "The model service is rate limiting (429)"                | Wait, or lower your usage on that provider.                                                                                             |
| "Too many explanations. Try again in … seconds."          | Harkback's own limit (settings → _Limits and hints_). Failed requests are not counted.                                                  |
| "Invalid / insecure model address"                        | Plain `http` is only allowed for this computer and your own network. Use `https` otherwise.                                             |
| "This source is sensitive and can only use a local model" | Add a local model and tick **For sensitive sources**, or mark the source normal.                                                        |

After any failure the card offers **Try again**, and **Try with …** when you have more than one model.

## Nothing is underlined

- Pages other than arXiv are scanned only after you click the toolbar button, press `Alt+Shift+E`, or allow the site under _Sites_.
- You must have looked up the term on a **different page** first, at least _reunion gap_ days ago (default 3). Lower the gap to 0 to test.
- The term may be muted (concept page → Unmute).
- Short or ambiguous terms need help: an abbreviation like `SAM` or `GP` shows only when another term from the same field is on the page. Chinese names need three characters.
- Private windows never scan.
- The site may be **Disabled** in a site rule.

## The Explain button does not appear

- It appears for selections of up to 200 characters. Longer ones are ignored.
- On a page you have not scanned yet, use the toolbar button once, or `Alt+Shift+E`.
- Selections inside text boxes and some embedded frames are not available to extensions.

## A PDF on my computer will not open

Two approvals are needed, once:

1. `chrome://extensions` → Harkback → **Details** → turn on **Allow access to file URLs**.
2. On the reader page, click **Allow local files**.

## A scanned PDF shows no text, or the wrong text

A PDF that is only pictures of pages is read with OCR on your computer, page by page as you scroll; the bar at the top shows progress. Reading takes a few seconds per page, and the text becomes selectable as each page finishes. What was read is kept, so the next visit is instant.

- English is built in. For another language, open **Languages** in the bar at the top of the reader (or _Languages for scanned PDFs_ in settings), install it, tick it together with English if the document mixes them, and choose **Read again with these**. The pack is downloaded once from `cdn.jsdelivr.net`; no document content is sent.
- If the bar says the reading is uncertain, the document is probably in another language than the one chosen.
- OCR works best on clean, upright pages. Handwriting, formulas and tables are not recovered, and pages that are rotated in the file may not line up with their text.

Complicated layouts (tables, three or more columns) may split paragraphs imperfectly.

## The shortcut does nothing

Another extension or the system may own `Alt+Shift+E`. Rebind it at `chrome://extensions/shortcuts`.

## Backups and imports

- **Back up now fails.** Chrome must be allowed to download to `Downloads/harkback`. If a download is interrupted, the previous backups are kept.
- **Import says "0 new events".** Everything in the file is already in your history. Nothing was lost.
- **Import skipped lines.** Lines that are not valid events (from a damaged file or a newer Harkback) are skipped and counted; the rest are imported.

## Obsidian notes

Exporting again rewrites each note but keeps what you wrote below the line `<!-- harkback:end … -->`. A note from an export made before that line existed has no marker and is replaced. If you renamed or moved a note, the next export writes a new one under its original name.

## Still stuck

Open an issue (see [CONTRIBUTING](../CONTRIBUTING.md#reporting-bugs)) with the browser version, what you selected, what you expected and what happened. Never paste API keys or private page content. The service worker's console (`chrome://extensions` → Harkback → _service worker_) shows errors that are not on the card.
