# Harkback website

Published with GitHub Pages at https://zestworks-io.github.io/harkback/. Plain static files: `index.html`, `privacy/`, `terms/` and a copy of each under `zh/` (Simplified Chinese), `zh-tw/`, `ja/`, `ko/`, `es/`, `fr/`, `de/` and `pt-br/`. Every page ends with a link to the same page in each language. The documentation under `guide/` is not stored here: `tools/build-guide.mjs` renders the repository's `guide/*.md`, and the translations in `guide/<language>/*.md`, into `site/guide/` when the site is deployed (it is git-ignored), and fails if a link between pages or to a heading is broken. A translated page may link to the English pages (`../models.md`). All links are relative, so the site works under the `/harkback/` path and on any other static host.

Deploys run from `.github/workflows/pages.yml` whenever `site/` changes on `main`. One-time setup: in the repository settings, **Pages → Build and deployment → Source: GitHub Actions**.

Preview: `npm install --no-save --no-package-lock --prefix tools marked@18.1.0 && node tools/build-guide.mjs`, then `python3 -m http.server -d site 8000`.

The privacy policy mirrors the root `PRIVACY.md`. Change both together, and update the "Last updated" date on the page.

The translated privacy policy and terms say that the English version applies if they differ. When the English text changes, change every translation and its date too.
