# Changelog

All notable changes to Harkback. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

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

- Snake_case identifiers such as `max_tokens` were rendered as italic text, and dollar amounts such as `$5 … $10` as a formula.
- A long paragraph was cut from its start, so the selected term could be missing from what the model saw. The paragraph is now centred on the selection.
- Non-streamed Gemini replies included the model's internal "thought" text.
- The previous backup was deleted before the new download had finished; it is now kept until the new file is complete, and a failed backup is reported.
- A follow-up answered before the explanation was recorded was shown but never saved.
- Mathematical bold letters and other characters outside the Basic Multilingual Plane were not matched.
- The toolbar badge no longer replays the whole log after every individual write.
- The page matcher is no longer rebuilt on every rescan.
