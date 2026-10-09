# Changelog

All notable changes to Harkback. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.0.2 - 2026-10-09

### Added

- **GitHub, Notion and Google Docs.** Add the site under Settings → Sites and its pages are read by their own layout: a repository's README, the conversation of an issue or pull request, a Notion page (including a database row opened in a peek), a Google document in its published or mobile view. Each is one source however its address is written (`github:owner/repo#12`, `notion:<page id>`, `gdoc:<document id>`), and only the document's text is read, not the navigation around it. Where a layout is not recognised, the page is read as before. The Google Docs editor draws its text and cannot be read; the toolbar button says so and points to the published or mobile view.
- **A page that looks private is asked about before anything is sent.** A private GitHub repository, or a page on Notion or Google Docs that is not published, is not sent to any model until you choose _Local only_ or _Send anyway_, in the card or in a small lock at the corner of the page. The choice is recorded as your own, can be remembered for the site, and in a private window holds for that page only. A sensitive page shows the lock too, and pressing it marks the page normal again (unless a site rule makes it sensitive, which the lock only reports).
- **YouTube captions.** Add YouTube under Settings → Sites (_+ YouTube captions_) and, with captions (CC) on, terms you have looked up before are underlined in the caption line of a watch page. Hover an underline to see what you understood last time; pause the video and select a term to explain it, and the explanation uses the captions you have already watched as its context. A lookup on a video is recorded like any other, with the playback position: concept pages, review cards, reunion hints and exports show it as `12:34`, and History and Review open the video at that moment. Nothing is downloaded: Harkback reads only the captions the player is showing, and it does nothing on YouTube until you add the site. A video is one source (`youtube:<id>`) however you reached it. The event format gains an optional `locator.t` (whole seconds); logs without it replay as before.
- **Suggested research sites.** Settings → Sites has a _Suggested research sites_ button that adds auto-scan rules for bioRxiv, medRxiv, PubMed (abstracts only), SSRN, OpenReview and ACL Anthology in one step. It skips sites that already have a rule and never changes one you edited. Saving asks the browser for site access once for all of them.

### Changed

- **An issue or pull request is as sensitive as its repository.** Marking a repository sensitive covers its issues and pull requests, recorded or not. Saying that one issue is fine overrides this for that issue, unless you mark the repository again afterwards.
- **A site-wide "not sensitive" rule no longer hides a page that says it is private.** On a private-looking page you are asked once, and the answer is kept for that source.
- **The card does not offer to mark a source sensitive when it already is.**
- **More abbreviations are treated as ambiguous.** Common medical and machine-learning abbreviations (MS, CAD, PE, RA, CT, AD, PD, ER, CI, GAN, RNN, SVM) and any short key shared by two concepts, even in the same field, now underline only when another term from that field is also on the page.
- **A paper seen under its arXiv id and its DOI counts as one source.** A reunion no longer calls a term new to a paper when you met it in the same paper under its other id. Existing records are unchanged.

### Fixed

- "Check my answer", comparing with an earlier look-up, and backups and exports that leave out sensitive sources now treat a paper as sensitive under either of its ids, and an issue as sensitive when its repository is. They used to look only at the id a source was recorded under.
- A term selected in another language no longer creates a second concept. When the model's card gives the English name of a concept you already have (as its name or one of its aliases, in the same field), the lookup joins that concept and adds the selected text as an alias, so the next page matches either language. Names shared by several concepts, or by concepts in another field, still stay separate.

## 1.0.1 - 2026-10-09

### Changed

- **Onboarding is a three-step stepper**: Welcome, Privacy and Model, with a progress bar (finished steps can be clicked to go back). _Next_ is disabled on the Privacy step until the consent box is ticked, and the done screen lists what Settings offers.
- **Chrome's built-in model is a card on the Model step**, with its status, a _Download model_ button and a note that it is a small model that can be slow. _Finish_ waits while it downloads, and the progress keeps showing when you move between steps.
- **Settings → Limits and hints is split** into _Rate limits_ and _Reunion hints_ (General tab), each with an explanation; _Model timeouts_ moved to the Models tab.
- **"For sensitive sources" is now "Sensitive provider"** on a model row.
- **History and review link back to the source.** A source title opens the page it came from (its address, or its arXiv or DOI page) in a new tab.
- All pages share one set of design tokens, so light and dark look the same everywhere.

### Added

- **Review with a memory model.** Terms are scheduled with FSRS-7, the newest version of the memory model, which keeps a fast and a slow trace of each memory, and a wait is never longer than a year: answer _Again_, _Hard_, _Good_ or _Easy_, and each button shows when the term comes back. This replaces the fixed 1, 3, 7, 14, 30 and 60 day ladder. Older _Got it_ and _Still confused_ marks count as Good and Again. Settings → Review sets the target recall (90% by default).
- **Prerequisites decide the review order.** When a term and one it builds on are both due, the prerequisite comes first, even when it is reached through a concept that is not due. The card says which due terms build on it. Rejected or unlikely relations are ignored, and terms in a cycle keep the usual order.
- **Start with the prerequisites.** On a concept page, and under the explanation in review, a term you are confused or shaky about names the prerequisites that may be what is missing: ones that are confused, shaky or never explained, followed down through weak ones to the weakest foundation. The page shows three and counts the rest.
- **Preview a page before you read it.** The toolbar button, `Alt+Shift+P` or the right-click menu offers to scan the page, naming the model and whether it is remote; nothing is sent until you press _Scan_. One model call lists the page's key terms, and your own records sort them into _Still confused_, _Rusty_ (shaky or due for review), _New to you_ and _Known_. _Preview_ shows your earlier explanation for a term you know, or a short model-written one for a new term; nothing is recorded. The model only sees the page text, never your concept list, and sensitive pages only use a local model. A scan reads the first 16,000 characters of a page, and says so when a longer page was cut.
- **Chrome's built-in model (Gemini Nano) as a model choice.** Pick _Chrome built-in (Gemini Nano)_ under Settings → Models: it runs on your computer, needs no address or API key, and counts as a local model, so sensitive sources can use it. It is downloaded from settings (Chrome only starts a download from a click), and until it is ready a request says so instead of failing. It works best in English, Spanish and Japanese, and its small window means a prompt that does not fit is reported, not cut.
- **A _Shaky_ understanding level** for terms last answered _Hard_. It shows in the badge, the graph and its filter, and the digest counts _Hard_ answers apart from _Good_ and _Easy_. Review brings confused terms first, then shaky ones.
- **Type your answer in review**, and an optional **Check my answer** button that asks your model how close you were. It says which model receives the answer and whether it is remote, suggests a grade without choosing it, follows the sensitive-source rules, and can be turned off in settings.
- **Keyboard-only review.** `Space` shows the explanation, `1`–`4` grade, `S` skips.
- **Weekly digest.** History → Digest summarizes a week from your records, with no model call.
- **Graph filters** by field, understanding and when a term was last looked up.
- **"Why underlined"** line on a reunion hint, naming the text that matched.
- **Timeout settings** for how long a model may stay quiet, and how long to wait for its first text.
- **Try it first** on the onboarding page: a built-in example explanation that calls no model.
- Four new event actions: `review_again`, `review_hard`, `review_good`, `review_easy` (the JSON schema is regenerated). An older Harkback importing a backup that contains them may skip those events.

### Fixed

- Chrome's built-in model: requests now name their language, so Chrome no longer warns about a missing output language. Languages it does not handle fall back to English.
- Drop-down arrows had no room on the right; they are drawn with space around them on every page.
- Running onboarding again no longer adds a second copy of the same model; it updates the one you have.
- Settings: after pressing _Save_, a later edit to a model row was lost, because the row still pointed at the settings from before the save.
- A failed request gives back its own rate-limit slot, not the latest one.
- Two backups can no longer run at once.
- Chat history keeps who said what for the Anthropic and Gemini formats.
- Loopback addresses (`127.0.0.0/8`, `*.localhost`) count as this computer.
- Markdown links keep parentheses in their address.
- "Check my answer" keeps one answer from landing on the next card when you skip or grade while the model is still replying, and a grade key pressed twice records one answer.
- A reply that "Check my answer" cannot read gives the rate-limit slot back.
- A mark on the explain card made right after a look-up is no longer counted as a review answer, so the first review is still due the next day. Older review marks, made a day or more later, still count.
- Review answers accept only the four grades; the older marks are only read from existing records.
- A PDF over 64MB is downloaded by the reader instead of being copied through a message.

## 0.2.0 - 2026-10-02

### Added

- **Scanned PDFs.** Pages that are only pictures are read with OCR on your computer, as they come near the screen, and then behave like text: select, explain, record. English is built in; other languages (Chinese first) are installed from a list, each downloaded once from `cdn.jsdelivr.net` and checked against a checksum. The languages are chosen per document, and what was read is kept.
- **Concept graph.** History → Graph draws concepts and their relations as a map, coloured by how well each is understood. Drag, zoom, filter by name, click to open a concept.
- **Import JSONL.** Restore records from a backup; records already present are skipped, so importing is safe to repeat.
- **Anki export.** One card per concept as tab-separated text.
- **Leave sensitive sources out of backups and exports** (settings → Backup).
- **Mark a sensitive source as normal again** from its history entry.
- **Stop** an explanation or follow-up while it is written.
- **Try with another model** after a failed explanation, when several models are configured.
- **Right-click menu** entry _Explain_ for selected text (new `contextMenus` permission). The _Explain_ button also appears for keyboard and touch selections.
- **Rescans** of pages that load more text or move to another page without reloading.
- **Models on your own network** (`192.168.x.x`, `10.x.x.x`, `*.local`, Tailscale, …) may use plain `http`. They count as remote, so sensitive sources never go to them.
- **Per-setting site rule overrides.** The most specific matching rule decides each of auto-scan, sensitive and disabled, and a rule can switch a setting off as well as on.
- **Markdown tables and nested lists** in explanations.
- Documentation in `guide/`.

### Changed

- The interface and the settings default to **English** (was Simplified Chinese).
- Notes exported to a folder keep what you wrote below the `<!-- harkback:end … -->` line when exported again.
- A URL-prefix site rule now matches only at a path boundary: `…/docs` no longer matches `…/docs-private`.
- Sensitive sources stay sensitive in replay unless the reader changes them (`by_user` on `source.seen`).
- A request that fails before an answer arrives no longer counts against the rate limit, and configuration errors do not consume it.

### Fixed

- Backups and exports that leave out sensitive sources now also leave out sources that a sensitive site rule covers, as explanation requests already did.
- Exporting notes no longer overwrites a file in the notes folder that has text but not Harkback's marker line; it is skipped and reported.
- The setup page gave the shortcut as Alt+E; it is Alt+Shift+E.
- A failed database read in the background was remembered until the worker restarted; the next request now tries again.
- A malformed `#concept=` address no longer breaks the History page.
- Import stopped treating every database error as a duplicate: only duplicates are skipped, and a full disk now fails the import.
- A follow-up answer in text of four-byte characters could exceed the size limit of an event and be rejected when restoring a backup.
- A model at an IPv6 address (such as `http://[::1]:8080`) failed with an internal error, because the permission check cannot name such an address; the request is now sent and decides for itself.
- Anki export: a card whose text begins with a double quote was read by Anki as a quoted field and lost its text; quotes are now escaped.
- A page that changed while its tab was in the background was not scanned again when the tab came back.
- Hand-edited rate and reunion limits of zero or a fraction are replaced by the defaults, instead of blocking every request.
- Absurdly nested formulas no longer break the explanation card.
- A PDF page that scrolled away while it was being drawn kept its picture in memory.
- Snake_case identifiers such as `max_tokens` were rendered as italic text, and dollar amounts such as `$5 … $10` as a formula.
- A long paragraph was cut from its start, so the selected term could be missing from what the model saw. The paragraph is now centred on the selection.
- Non-streamed Gemini replies included the model's internal "thought" text.
- The previous backup was deleted before the new download had finished; it is now kept until the new file is complete, and a failed backup is reported.
- A follow-up answered before the explanation was recorded was shown but never saved.
- Mathematical bold letters and other characters outside the Basic Multilingual Plane were not matched.
- The toolbar badge no longer replays the whole log after every individual write.
- The page matcher is no longer rebuilt on every rescan.
