# Microsoft Edge Add-ons submission

Edge runs Chrome's Manifest V3 extensions, so the package is the same code built with `wxt zip -b edge`. The listing text, screenshots and privacy answers are reused from the Chrome submission in the folder above; only the points below differ.

| Partner Center field             | Source                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package                          | `pnpm zip:edge` → `apps/extension/.output/harkback-<version>-edge.zip`                                                                                                           |
| Name, description, category      | `description.en.txt` (Edge wording; name and summary from `../listing.en.md`), `../listing.zh-CN.md` (add as a listing language; replace its Chrome-model sentence the same way) |
| Screenshots (1280×800, up to 10) | `../assets/1-explain.png` … `../assets/6-model.png`                                                                                                                              |
| Store logo (300×300, required)   | `../assets/store-logo-300x300.png` (redrawn from `assets/logo.png` at 300×300)                                                                                                   |
| Small promo tile (440×280)       | `../assets/promo-small-440x280.png`                                                                                                                                              |
| Marquee (1400×560, optional)     | `../assets/promo-marquee-1400x560.png`                                                                                                                                           |
| Search terms (up to 7)           | see below                                                                                                                                                                        |
| Privacy policy URL               | the deployed `site/privacy/` page                                                                                                                                                |
| Notes for certification          | see below                                                                                                                                                                        |

## Differences from the Chrome submission

- **Permission and data answers** are the same as `../privacy-practices.md`. Edge asks for them as "Properties" and the privacy questionnaire; use the same single purpose, permission reasons and data disclosures. Read `chrome://extensions/shortcuts` there as `edge://extensions/shortcuts`.
- **The built-in model.** The _Chrome built-in (Gemini Nano)_ choice uses the browser's `LanguageModel` global. Edge does not necessarily provide it, and it has not been tested here. Where it is missing the choice reports "not supported in this browser" and the reader picks Ollama or an API key; nothing breaks. Do not claim an on-device model for Edge in the listing.
- **No update URL or key.** The package carries none; the store handles updates.

## Search terms

`explain terms`, `reading`, `research papers`, `arXiv`, `flashcards`, `knowledge graph`, `local AI`

## Notes for certification

Harkback has no server and no account. To test it: open any arXiv paper (for example https://arxiv.org/abs/1706.03762), select a term and press Alt+Shift+E. An explanation needs a model; the reviewer can add any OpenAI-compatible endpoint under Settings → Models, or follow the first-run setup. Site access is optional and requested for one site at a time. The extension contains all of its code; it downloads none.

## Steps

1. Deploy the website (`site/README.md`) and check that the privacy page opens.
2. Make sure `version` in `apps/extension/package.json` is higher than the published one.
3. `pnpm zip:edge`, then load `apps/extension/.output/edge-mv3` unpacked at `edge://extensions` (Developer mode) and explain one term.
4. Partner Center → Microsoft Edge → Overview → Create new extension → upload the zip → fill Availability, Properties, Store listings and Submit.

If a release was built from another commit than the working tree, build it in a clean checkout of that commit (`git worktree add --detach <dir> <commit>`, then `pnpm install --frozen-lockfile && pnpm zip:edge` there).

Partner Center rejects a package that contains a compressed file ("The uploaded package consists of a compressed file"). The build therefore unpacks the bundled OCR language pack to `ocr/eng.traineddata`; do not add `.gz`, `.zip` or similar files to the extension.
