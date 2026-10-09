# Privacy and sensitive sources

The policy itself is [PRIVACY.md](../PRIVACY.md). This page explains the rules and how the code enforces them.

## What leaves your computer

Only the request you trigger: when you ask for an explanation or a follow-up, the model service you configured receives

- the selected text (at most 200 characters),
- its paragraph (at most 2,000 characters, centred on the selection),
- the section heading and the page title,
- the first sentence of the abstract,
- the names of up to three of your earlier concepts that look like the term, and whether you understood them,
- for _Compare_: the earlier quote, source title and explanation,
- for a follow-up: your question and the earlier explanation,
- for **Check my answer** in review (only when you press it, and it can be turned off in settings): the term, what you typed, and the stored explanation. The same model and sensitive-source rules apply, and each check counts against your rate limit. The check itself is not saved; only the grade you pick afterwards is.

Nothing else is sent: not the rest of the page, not your history, not your other settings. There is no analytics and no developer server.

Page text and earlier explanations are placed inside delimiters, and the model is told not to follow instructions found in them. The reply is parsed defensively and shown as text or through a restricted Markdown renderer; it is never inserted as HTML.

## Sensitive sources

Mark a source sensitive when its content must not leave your computer.

- On the explain card: **Mark source as sensitive**.
- In settings: tick **Sensitive** on a site rule.

For sensitive material:

- the request goes only to the model ticked **Sensitive provider**, which must be local (`127.0.0.1`, `localhost`, `[::1]`). A server on your own network does not qualify. With no such model, the explanation fails with a message instead of falling back to a remote one;
- earlier concepts known only from sensitive sources are not listed to a remote model, even for a different, normal page;
- **Compare** refuses to send a sensitive earlier record to a remote model;
- records are still kept in your browser, and the history shows a **Sensitive source** badge.

Sensitivity is **sticky**. Once a source is sensitive, only your own choice (**Mark as normal** on its history entry) makes it normal again: an automatic record from elsewhere, such as a backup restored from a device that never knew, cannot undo it.

A site rule that matches a source applies even to records made before the rule existed. Rules can be switched off for a more specific path; see [Site rules](user-guide.md#site-rules).

## Private windows

Incognito windows must be allowed for the extension in Chrome. In them Harkback explains but never records, scans or shows reunions, and every write request is refused.

## Where your data is

| What                                | Where                                                                                                | Leaves the browser?                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Records (event log)                 | IndexedDB, in this browser profile                                                                   | Only in backups and exports you make or enable                                |
| Settings and API keys               | `chrome.storage.local`, unencrypted                                                                  | Never in backups or exports                                                   |
| Weekly backup                       | `Downloads/harkback/` as JSONL                                                                       | It is a plain file; protect it like any other                                 |
| Scanned PDF text and language packs | IndexedDB `harkback-ocr`, in this browser profile; the text is cached per page so a PDF is read once | Never; not in backups or exports; language packs are downloaded, not uploaded |
| PDF being opened                    | A temporary IndexedDB entry, deleted when the reader takes it, or after 10 minutes at the next PDF   | No                                                                            |

**Leave sensitive sources out of backups and exports** (settings → Backup) removes everything that came from sensitive sources, and concepts known only from them, from backups, Markdown, notes and Anki files.

## Limits to know about

- **Reunion underlines live in the page**, so the page's own scripts may infer which terms you have records for.
- **Deletion** removes an entry in the app and clears its text from the stored log; traces may remain on disk, and exported backups cannot be recalled. Use full-disk encryption.
- **Keys are unencrypted** in extension storage.
- **The model service's terms apply** to what you send it. A local model keeps even that on your computer.
