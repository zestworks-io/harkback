// Renders guide/*.md into static pages under site/guide/ with the site's own header, footer and theme.
// Run by .github/workflows/pages.yml before the site is uploaded; the output is not committed.
//
//   npm install --no-save --no-package-lock --prefix tools marked@18.1.0
//   node tools/build-guide.mjs [outDir]
//
// Links between guide pages become links between the generated pages; links to other files in the repository become GitHub links.
// A link to a guide page or heading that does not exist fails the build.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guideDir = path.join(root, "guide");
const outDir = path.resolve(process.argv[2] ?? path.join(root, "site", "guide"));
const REPO = "https://github.com/zestworks-io/harkback";

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripTags = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** GitHub's heading anchors, so the links written for the repository view keep working. */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

const files = readdirSync(guideDir).filter((f) => f.endsWith(".md"));
const pageOf = (file) => (file === "README.md" ? "" : file.replace(/\.md$/, ""));
const marked = new Marked({ gfm: true });

const pages = new Map();
for (const file of files) {
  const used = new Map();
  let title = "";
  const html = marked.parse(readFileSync(path.join(guideDir, file), "utf8")).replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = stripTags(inner);
    if (level === "1" && !title) title = text;
    const base = slug(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  pages.set(pageOf(file), {
    file,
    html,
    title: title || "Documentation",
    ids: new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])),
  });
}

const problems = [];

/** Where a link written in guide/<file> should point from the generated page `from`. */
function rewrite(href, from, file) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href;
  const [target, hash = ""] = href.split("#");
  const anchor = hash ? `#${hash}` : "";
  const here = from === "" ? "./" : "../";
  if (target === "") {
    if (hash && !pages.get(from).ids.has(hash)) problems.push(`${file}: no heading #${hash}`);
    return anchor;
  }
  const resolved = path.posix.normalize(path.posix.join("guide", target));
  if (!resolved.startsWith("..") && resolved.startsWith("guide/") && target.endsWith(".md")) {
    const name = pageOf(path.posix.basename(resolved));
    const page = pages.get(name);
    if (!page) {
      problems.push(`${file}: no guide page ${target}`);
      return href;
    }
    if (hash && !page.ids.has(hash)) problems.push(`${file}: no heading #${hash} in ${target}`);
    const to = name === "" ? here : from === "" ? `./${name}/` : name === from ? "./" : `../${name}/`;
    return `${to}${anchor}`;
  }
  const repoPath = resolved.replace(/^guide\/\.\.\//, "");
  if (repoPath.startsWith("..") || repoPath === "guide" || repoPath.startsWith("guide/")) {
    problems.push(`${file}: cannot link ${href}`);
    return href;
  }
  const kind = path.posix.extname(repoPath) ? "blob" : "tree";
  return `${REPO}/${kind}/main/${repoPath}${anchor}`;
}

function shell({ title, body, up, current }) {
  const nav = [
    ["Home", `${up}../`, false],
    ["Docs", `${up}`, current],
    ["Privacy", `${up}../privacy/`, false],
    ["Terms", `${up}../terms/`, false],
  ]
    .map(([label, href, active]) => `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Harkback docs</title>
<meta name="description" content="Harkback documentation: ${escapeHtml(title)}.">
<link rel="icon" href="${up}../favicon.png">
<link rel="stylesheet" href="${up}../style.css">
<script src="${up}../theme.js"></script>
</head>
<body>
<header class="site"><div class="wrap">
<a class="brand" href="${up}../"><img src="${up}../icon.png" alt="" width="24" height="24">Harkback</a>
<nav class="site">${nav}<a href="${up}../zh/" lang="zh-CN">简体中文</a></nav>
</div></header>
<main class="doc"><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
<span>© 2026 Zestworks · Apache-2.0</span>
<span><a href="${REPO}">GitHub</a> · <a href="${REPO}/issues">Issues</a></span>
</div></footer>
</body>
</html>
`;
}

rmSync(outDir, { recursive: true, force: true });
for (const [name, page] of pages) {
  const up = name === "" ? "./" : "../";
  const html = page.html.replace(/href="([^"]*)"/g, (_, href) => `href="${rewrite(href.replace(/&amp;/g, "&"), name, page.file)}"`);
  const back = name === "" ? "" : `<p class="crumb"><a href="${up}">← All documentation</a></p>\n`;
  const dir = name === "" ? outDir : path.join(outDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "index.html"),
    shell({ title: page.title, body: `${back}<article class="prose">\n${html}</article>`, up, current: name === "" }),
  );
}

if (problems.length > 0) {
  process.stderr.write(`${`Guide links are broken:\n${problems.map((p) => `  ${p}`).join("\n")}`}\n`);
  process.exit(1);
}
process.stdout.write(`${`Rendered ${pages.size} guide pages into ${path.relative(root, outDir) || "."}`}\n`);
