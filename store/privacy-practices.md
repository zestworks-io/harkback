# Chrome Web Store: Privacy practices tab

Paste these into the dashboard. They describe what the build in the `harkback-<version>-chrome.zip` does; if behavior changes, change this file and the privacy policy together.

## Single purpose

Explain terms the user selects while reading, keep a private record of what they understood, and remind them of it when the term appears again.

## Permission justifications

| Permission                              | Justification                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                               | Keeps the user's settings and their explanation records in the browser. Nothing is sent to the developer.                                                                |
| `alarms`                                | Schedules the weekly local backup and refreshes, once an hour, the number of terms due for review shown on the toolbar icon.                                             |
| `downloads`                             | Saves the weekly JSONL backup of the user's records to their Downloads folder, and removes the previous backup file.                                                     |
| `offscreen`                             | Creates the backup file in an offscreen document, because a Manifest V3 service worker cannot build a downloadable file.                                                 |
| `scripting`                             | Lets the toolbar button and the Alt+E shortcut run the page scanner on the page the user chooses.                                                                        |
| `activeTab`                             | Gives access to the current page only after the user clicks the toolbar button or presses the shortcut.                                                                  |
| Content script on `https://arxiv.org/*` | arXiv papers are the main use case, so the selection button and underlines run there automatically.                                                                      |
| Optional host access `*://*/*`          | Requested at runtime, for one site at a time, only when the user scans a site, adds it to their allowed list, or enters a model address. It is never granted at install. |
| Optional host access `file:///*`        | Requested only if the user wants to read a PDF stored on their computer. The file is read in the browser and never uploaded.                                             |
| Keyboard command `Alt+E`                | Explains the selected text. The user can rebind it at `chrome://extensions/shortcuts`.                                                                                   |

## Remote code

**No.** All code is bundled in the package, including pdf.js. The extension sends requests to the model service the user configured, and does not download or run code from any server.

## Data usage disclosures

Tick only what the build actually handles, and explain it in the policy.

- **Website content**: Yes. When the user asks for an explanation, the selected text, its paragraph, the section and the page title are sent to the model service the user configured (for example Ollama on their computer, or a hosted API). Nothing is sent to the developer.
- **Authentication information**: Yes. A model API key entered by the user is stored in the extension's local storage and sent only to the model address they entered.
- **Personally identifiable information, health, financial, location, web history, user activity**: No.

Certify all three statements:

- The data is not sold to third parties.
- The data is not used or transferred for purposes unrelated to the single purpose.
- The data is not used or transferred to determine creditworthiness or for lending.

## Links

- Privacy policy: the deployed `site/privacy/` page (see `site/README.md`).
- Homepage: the deployed `site/` home page.
- Support: https://github.com/zestworks-io/harkback/issues
