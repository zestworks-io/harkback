#!/usr/bin/env bash
# Builds the Chrome Web Store package: harkback-<version>-chrome.zip in apps/extension/.output/.
# Usage: tools/package.sh [--skip-checks]
set -euo pipefail
cd "$(dirname "$0")/.."

skip_checks=0
[[ "${1:-}" == "--skip-checks" ]] && skip_checks=1

version=$(node -p "require('./apps/extension/package.json').version")
zip="apps/extension/.output/harkback-${version}-chrome.zip"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "warning: the working tree has uncommitted changes; the package will include them." >&2
fi

if [[ $skip_checks -eq 0 ]]; then
  pnpm install --frozen-lockfile
  pnpm typecheck
  pnpm lint
  pnpm test
  # Production build, then the manifest permission and content-script size checks.
  pnpm check:build
fi

rm -f "$zip"
pnpm zip

# The package must be the production build: right version, no test hosts, no source maps, icons present.
node - "$zip" "$version" <<'JS'
const { execFileSync } = require("node:child_process");
const [zip, version] = process.argv.slice(2);
const list = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
const manifest = JSON.parse(execFileSync("unzip", ["-p", zip, "manifest.json"], { encoding: "utf8" }));
const problems = [];
if (manifest.version !== version) problems.push(`manifest version ${manifest.version} is not ${version}`);
if ((manifest.host_permissions ?? []).length > 0) problems.push(`unexpected host_permissions: ${manifest.host_permissions}`);
if (list.some((f) => f.endsWith(".map"))) problems.push("source maps are included");
for (const size of [16, 32, 48, 128]) if (!list.includes(`icons/${size}.png`)) problems.push(`missing icons/${size}.png`);
if (problems.length > 0) {
  console.error(problems.map((p) => `error: ${p}`).join("\n"));
  process.exit(1);
}
JS

echo
echo "Package ready: $zip"
ls -lh "$zip" | awk '{print "Size:    " $5}'
shasum -a 256 "$zip" | awk '{print "SHA-256: " $1}'
echo "Upload it at https://chrome.google.com/webstore/devconsole"
