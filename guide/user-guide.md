# User guide

## Contents

- [Explaining](#explaining)
- [Follow-up questions](#follow-up-questions)
- [Reunions](#reunions)
- [Concepts and spellings](#concepts-and-spellings)
- [Review](#review)
- [Graph](#graph)
- [History](#history)
- [Export, backup and restore](#export-backup-and-restore)
- [Site rules](#site-rules)
- [Keyboard and shortcuts](#keyboard-and-shortcuts)

## Explaining

Select up to 200 characters, then use any of these:

| Way                                 | Notes                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| The **Explain** button              | Appears next to a selection made with the mouse, the keyboard or touch.               |
| `Alt+Shift+E`                       | Works on the current selection. You can rebind it at `chrome://extensions/shortcuts`. |
| Right-click → **Harkback: Explain** | The same as the shortcut.                                                             |

The card shows the answer as it is written. While it is being written, **Stop** ends it. If the request fails, the card offers **Try again** and, when you have several models configured, **Try with…** for each of the others.

Each answer carries a tag:

- **Defined in source** – the page defines the term, and the quote the model gave was found in the page text.
- **External knowledge** – the model explained it from what it knows.

Explanations are written in the language you choose in settings (16 languages, or "follow the interface"). Technical terms keep their original form. Formulas are typeset, and tables and nested lists are shown.

If the term is close to one you already looked up, the model is told so and can explain the difference instead of starting over. If it is very close, Harkback asks "Is this the term you looked up 3 days ago?" and records your answer.

## Follow-up questions

**Ask more** opens a question box under the explanation. Each question stays above its answer, and the whole conversation is saved with the explanation. While an answer is written, the Send button becomes **Stop**. A follow-up answered before the explanation has been recorded (for example while the "same term?" question is open) is saved as soon as the explanation is.

## Reunions

When a page contains a term you have looked up before, Harkback underlines the first occurrence. Hover to open the card.

A reunion is shown only if:

- it is not the page where you looked the term up;
- at least _reunion gap_ days have passed since you last touched it (default 3);
- the term is not muted;
- if the term is an ambiguous abbreviation (`SAM`, `RL`, `MoE`, `GP`, or one that two concepts share), the page also contains another term from the same field;
- the page has not already used up its limit (default 3 per page). Terms you were confused about come first.

A page that only mentions a _variant_ of something you understood (for example `QLoRA`, when you understood `LoRA`) reminds you of the concept it varies.

Card buttons: **I remember**, **Explain again** (from another angle), **Compare usages** (the model contrasts the two contexts), **Don't show again**.

Pages that load more text, or a single-page app that moves to another page without reloading, are rescanned on their own.

## Concepts and spellings

`LLM`, `LLMs`, `the LLM`, `large language model` and `Large-Language Models` are one concept; so are `β-VAE` and `beta-VAE`, `fine-tuning` and `ﬁne-tuning` (with a ligature), and `résumé` and `resume`. Rules:

- Accents on Latin letters are ignored; there is no stemming except for English plurals.
- An abbreviation matches its full name when the name has at least three words. Two different full names for the same abbreviation in one field stay separate concepts.
- Chinese names, and Japanese names written only in kanji, need at least three characters to be underlined. Names with kana or Hangul need two.

On a concept page you can **add an alias**, **merge** two concepts that are the same (this cannot be undone), **remove** a wrong relation, or **mute** the concept. Adding an alias that already belongs to another concept is refused; merge instead.

## Review

**Review (n)** on the History page opens the queue of concepts that are due. The toolbar icon shows the same number.

For each concept you see its name first. Press **Show explanation** when you have tried to remember it, then **Remembered**, **Still confused** or **Skip**.

| After…                      | The concept returns in |
| --------------------------- | ---------------------- |
| You look it up (no answer)  | 1 day                  |
| **Still confused**          | 1 day                  |
| 1st **Remembered** in a row | 3 days                 |
| 2nd **Remembered** in a row | 7 days                 |
| 3rd **Remembered** in a row | 14 days                |
| 4th **Remembered** in a row | 30 days                |
| 5th and later               | 60 days                |
| **Skip**                    | no change              |

Marking a reunion as remembered counts as a successful review. Muted concepts are never due.

## Graph

**Graph** on the History page draws your concepts as a map. Fill colour shows how well you understood a concept (green understood, yellow confused, blue new); a dashed ring marks a concept that something points to but you have not explained yet. Blue arrows run from a concept to its prerequisites, purple arrows from a variant to what it varies, and dashed lines join related concepts.

Drag to move, scroll to zoom, click a concept to open it. The search box filters the graph to matching concepts and their neighbours. Only the 150 best-connected concepts are drawn, and weak or rejected relations are left out.

## History

Everything is grouped by concept, newest first, and updates live while other tabs record. Search covers names, quotes, explanations and follow-up conversations. **Select** lets you delete several entries at once. A source you marked sensitive shows a badge with **Mark as normal** (two clicks, because it allows its content to go to remote models again).

Deleting an entry removes it from the app and clears its text from the stored log. Exported backups cannot be recalled.

## Export, backup and restore

| Button              | What you get                                                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export Markdown     | One file with every concept and encounter.                                                                                                                                                                                                                        |
| Export Anki cards   | A tab-separated text file: one card per concept. In Anki use File → Import.                                                                                                                                                                                       |
| Export notes folder | One Markdown note per concept with `[[links]]`, written to `Harkback/` in a folder you pick. Open that folder in Obsidian to see the graph there. Exporting again updates the notes but keeps whatever you wrote below the marker line `<!-- harkback:end … -->`. |
| Back up JSONL now   | The full event log, written to `Downloads/harkback/`. A backup also runs weekly; the last four are kept. Older ones are removed only after the new file is safely written.                                                                                        |
| Import JSONL        | Restores events from a backup. Events you already have are skipped, so importing twice changes nothing.                                                                                                                                                           |

Backups and exports never contain settings or API keys. In settings, **Leave sensitive sources out of backups and exports** removes everything that came from sensitive sources, and concepts known only from them.

The file format is documented in [Data format](data-format.md).

## Site rules

Under _Sites_ in settings, each rule has a pattern and three switches, plus an optional model:

- **Pattern** – a domain (`example.com`, which covers subdomains) or a URL prefix (`https://example.com/docs`, which matches that path and below).
- **Auto-scan**, **Sensitive**, **Disabled** – each can be inherited, on or off. Click a box to cycle: dash (inherit), ticked (on), empty (off).
- **Model** – use this model on matching pages instead of the default.

When several rules match a page, each setting comes from the **most specific** rule that sets it: a URL prefix beats a domain, and a longer pattern beats a shorter one. So you can mark a whole site sensitive and switch that off for one public path, or the other way round.

## Keyboard and shortcuts

| Key            | Action                                       |
| -------------- | -------------------------------------------- |
| `Alt+Shift+E`  | Explain the selection                        |
| `Esc`          | Close the card                               |
| `Enter`        | Send a follow-up question                    |
| Shift + arrows | Select with the keyboard; the button appears |
