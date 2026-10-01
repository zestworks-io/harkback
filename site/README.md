# Harkback website

Published with GitHub Pages at https://zestworks-io.github.io/harkback/. Plain static files, no build step: `index.html`, `privacy/`, `terms/` and the Chinese copies under `zh/`. All links are relative, so the site works under the `/harkback/` path and on any other static host.

Deploys run from `.github/workflows/pages.yml` whenever `site/` changes on `main`. One-time setup: in the repository settings, **Pages → Build and deployment → Source: GitHub Actions**.

Preview: `python3 -m http.server -d site 8000`.

The privacy policy mirrors the root `PRIVACY.md`. Change both together, and update the "Last updated" date on the page.
