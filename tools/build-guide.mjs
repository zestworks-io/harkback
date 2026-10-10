// Renders guide/*.md into static pages under site/guide/ with the site's own header, footer and theme.
// Run by .github/workflows/pages.yml before the site is uploaded; the output is not committed.
//
//   npm install --no-save --no-package-lock --prefix tools marked@18.1.0
//   node tools/build-guide.mjs [outDir]
//
// Links between guide pages become links between the generated pages; links to other files in the repository become GitHub links.
// A link to a guide page or heading that does not exist fails the build.
// A translated page lives in guide/<language>/<name>.md and is published at guide/<language>/<name>/. It may link to the English pages.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guideDir = path.join(root, "guide");
const outDir = path.resolve(process.argv[2] ?? path.join(root, "site", "guide"));
const REPO = "https://github.com/zestworks-io/harkback";
const SITE_URL = "https://zestworks-io.github.io/harkback/";

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

/** The languages a guide page can be translated into: the folder under guide/ and the site, the html lang, and the labels of the page. */
const LANGUAGES = {
  "": {
    label: "English",
    html: "en",
    home: "Home",
    docs: "Docs",
    privacy: "Privacy",
    terms: "Terms",
    issues: "Issues",
    all: "All documentation",
    suffix: "Harkback docs",
    describe: (t) => `Harkback documentation: ${t}.`,
  },
  zh: {
    label: "简体中文",
    html: "zh-CN",
    home: "首页",
    docs: "文档",
    privacy: "隐私政策",
    terms: "使用条款",
    issues: "反馈",
    all: "全部文档",
    suffix: "Harkback 文档",
    describe: (t) => `Harkback 文档：${t}。`,
  },
  "zh-tw": {
    label: "繁體中文",
    html: "zh-TW",
    home: "首頁",
    docs: "文件",
    privacy: "隱私權政策",
    terms: "使用條款",
    issues: "意見回饋",
    all: "全部文件",
    suffix: "Harkback 文件",
    describe: (t) => `Harkback 文件：${t}。`,
  },
  ja: {
    label: "日本語",
    html: "ja",
    home: "ホーム",
    docs: "ドキュメント",
    privacy: "プライバシー",
    terms: "利用規約",
    issues: "Issues",
    all: "すべてのドキュメント",
    suffix: "Harkback ドキュメント",
    describe: (t) => `Harkback ドキュメント：${t}。`,
  },
  ko: {
    label: "한국어",
    html: "ko",
    home: "홈",
    docs: "문서",
    privacy: "개인정보",
    terms: "이용약관",
    issues: "Issues",
    all: "전체 문서",
    suffix: "Harkback 문서",
    describe: (t) => `Harkback 문서: ${t}.`,
  },
  es: {
    label: "Español",
    html: "es",
    home: "Inicio",
    docs: "Documentación",
    privacy: "Privacidad",
    terms: "Condiciones",
    issues: "Issues",
    all: "Toda la documentación",
    suffix: "documentación de Harkback",
    describe: (t) => `Documentación de Harkback: ${t}.`,
  },
  fr: {
    label: "Français",
    html: "fr",
    home: "Accueil",
    docs: "Documentation",
    privacy: "Confidentialité",
    terms: "Conditions",
    issues: "Issues",
    all: "Toute la documentation",
    suffix: "documentation Harkback",
    describe: (t) => `Documentation Harkback : ${t}.`,
  },
  de: {
    label: "Deutsch",
    html: "de",
    home: "Start",
    docs: "Dokumentation",
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
    issues: "Issues",
    all: "Alle Dokumentation",
    suffix: "Harkback-Dokumentation",
    describe: (t) => `Harkback-Dokumentation: ${t}.`,
  },
  "pt-br": {
    label: "Português (Brasil)",
    html: "pt-BR",
    home: "Início",
    docs: "Documentação",
    privacy: "Privacidade",
    terms: "Termos",
    issues: "Issues",
    all: "Toda a documentação",
    suffix: "documentação do Harkback",
    describe: (t) => `Documentação do Harkback: ${t}.`,
  },
};
/** The page every language has, which the switcher falls back to for a page that is not translated. */
const ENTRY = "getting-started";

/** The guide's source files: the English pages, then each translated folder. A route is "name" or "language/name"; "" is the English index. */
const sources = [];
for (const file of readdirSync(guideDir).filter((f) => f.endsWith(".md"))) {
  sources.push({ lang: "", file, dir: guideDir, route: file === "README.md" ? "" : file.replace(/\.md$/, "") });
}
for (const lang of Object.keys(LANGUAGES).filter((l) => l !== "" && existsSync(path.join(guideDir, l)))) {
  for (const file of readdirSync(path.join(guideDir, lang)).filter((f) => f.endsWith(".md"))) {
    sources.push({ lang, file, dir: path.join(guideDir, lang), route: `${lang}/${file.replace(/\.md$/, "")}` });
  }
}
const unknown = readdirSync(guideDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !(e.name in LANGUAGES));
const marked = new Marked({ gfm: true });

const pages = new Map();
for (const { lang, file, dir, route } of sources) {
  const used = new Map();
  let title = "";
  const html = marked.parse(readFileSync(path.join(dir, file), "utf8")).replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = stripTags(inner);
    if (level === "1" && !title) title = text;
    const base = slug(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  pages.set(route, {
    file: path.relative(guideDir, path.join(dir, file)),
    lang,
    dir,
    html,
    title: title || "Documentation",
    ids: new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])),
  });
}

const problems = unknown.map((e) => `guide/${e.name}: not a known language folder (see LANGUAGES)`);

/** The directory of a route's generated page, relative to the site root. */
const dirOf = (route) => (route === "" ? "guide" : `guide/${route}`);
/** The link from the page at `from` to the page at `to`. */
function linkBetween(from, to) {
  const rel = path.posix.relative(dirOf(from), dirOf(to));
  return rel === "" ? "./" : `${rel}/`;
}
/** The route of `route` in another language, or that language's entry page when it is not translated; null when neither exists. */
function inLanguage(route, lang) {
  const name = pages.get(route)?.lang ? route.slice(route.indexOf("/") + 1) : route;
  const same = lang ? `${lang}/${name}` : name;
  if (name !== "" && pages.has(same)) return { route: same, exact: true };
  if (name === "" && !lang) return { route: "", exact: true };
  const entry = lang ? `${lang}/${ENTRY}` : "";
  return pages.has(entry) ? { route: entry, exact: false } : null;
}

/** Where a link written in a guide file should point from the generated page `from`. */
function rewrite(href, from, page) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href;
  const [target, hash = ""] = href.split("#");
  const anchor = hash ? `#${hash}` : "";
  if (target === "") {
    if (hash && !page.ids.has(hash)) problems.push(`${page.file}: no heading #${hash}`);
    return anchor;
  }
  const resolved = path.posix.normalize(path.posix.join("guide", page.lang, target));
  if (resolved.startsWith("guide/") && target.endsWith(".md")) {
    const rel = resolved.slice("guide/".length).replace(/\.md$/, "");
    const route = rel === "README" ? "" : rel;
    const linked = pages.get(route);
    if (!linked) {
      problems.push(`${page.file}: no guide page ${target}`);
      return href;
    }
    if (hash && !linked.ids.has(hash)) problems.push(`${page.file}: no heading #${hash} in ${target}`);
    return `${linkBetween(from, route)}${anchor}`;
  }
  if (resolved.startsWith("..") || resolved === "guide" || resolved.startsWith("guide/")) {
    problems.push(`${page.file}: cannot link ${href}`);
    return href;
  }
  const kind = path.posix.extname(resolved) ? "blob" : "tree";
  return `${REPO}/${kind}/main/${resolved}${anchor}`;
}

function shell({ title, body, route, page }) {
  const L = LANGUAGES[page.lang];
  const root = "../".repeat(dirOf(route).split("/").length);
  const prefix = page.lang ? `${page.lang}/` : "";
  const nav = [
    [L.home, `${root}${prefix}`, false],
    [L.docs, `${root}guide/${page.lang ? `${page.lang}/${ENTRY}/` : ""}`, route === (page.lang ? `${page.lang}/${ENTRY}` : "")],
    [L.privacy, `${root}${prefix}privacy/`, false],
    [L.terms, `${root}${prefix}terms/`, false],
  ]
    .map(([label, href, active]) => `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("");
  const alternates = [];
  const switcher = [];
  for (const [code, other] of Object.entries(LANGUAGES)) {
    const found = inLanguage(route, code);
    if (!found) continue;
    const href = linkBetween(route, found.route);
    if (found.exact) alternates.push(`<link rel="alternate" hreflang="${other.html}" href="${SITE_URL}${dirOf(found.route)}/">`);
    switcher.push(`<a href="${href}" lang="${other.html}"${code === page.lang ? ' aria-current="true"' : ""}>${other.label}</a>`);
  }
  if (alternates.length > 0) {
    const english = inLanguage(route, "");
    if (english?.exact) alternates.push(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}${dirOf(english.route)}/">`);
  }
  return `<!doctype html>
<html lang="${L.html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${L.suffix}</title>
<meta name="description" content="${escapeHtml(L.describe(title))}">
<link rel="icon" href="${root}favicon.png">
${alternates.length > 0 ? `${alternates.join("\n")}\n` : ""}<link rel="stylesheet" href="${root}style.css">
<script src="${root}theme.js"></script>
</head>
<body>
<header class="site"><div class="wrap">
<a class="brand" href="${root}${prefix}"><img src="${root}icon.png" alt="" width="24" height="24">Harkback</a>
<nav class="site">${nav}</nav>
</div></header>
<main class="doc"><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
<span>© 2026 Zestworks · Apache-2.0</span>
<span><a href="${REPO}">GitHub</a> · <a href="${REPO}/issues">${L.issues}</a></span>
<div class="langs">${switcher.join("")}</div>
</div></footer>
</body>
</html>
`;
}

rmSync(outDir, { recursive: true, force: true });
for (const [route, page] of pages) {
  const html = page.html.replace(/href="([^"]*)"/g, (_, href) => `href="${rewrite(href.replace(/&amp;/g, "&"), route, page)}"`);
  const index = linkBetween(route, "");
  const back = route === "" ? "" : `<p class="crumb"><a href="${index}">← ${LANGUAGES[page.lang].all}</a></p>\n`;
  const dir = route === "" ? outDir : path.join(outDir, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "index.html"),
    shell({ title: page.title, body: `${back}<article class="prose">\n${html}</article>`, route, page }),
  );
}

if (problems.length > 0) {
  process.stderr.write(`${`Guide links are broken:\n${problems.map((p) => `  ${p}`).join("\n")}`}\n`);
  process.exit(1);
}
process.stdout.write(`${`Rendered ${pages.size} guide pages into ${path.relative(root, outDir) || "."}`}\n`);
