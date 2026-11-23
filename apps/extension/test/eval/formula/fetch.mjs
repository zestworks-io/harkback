// Downloads the papers of the formula evaluation set: node apps/extension/test/eval/formula/fetch.mjs
//
// Each paper is openly licensed (CC BY 4.0) and pinned to a version. Its arXiv HTML page is trimmed to the article (no
// scripts, styles, images or bibliography) and saved under pages/; its PDF is read with pdf.js and the text lines are saved
// under pdf/, in the order and grouping a reader sees them, so equation matching is measured on what real PDFs give.
// The saved files are the source of truth (see NOTICE.md): arXiv re-renders HTML now and then, so a new download may differ.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PAPERS } from "./papers.mjs";

const EXTRACTED = "Text extracted from the paper's PDF with pdf.js and grouped into lines; not the PDF itself.";
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "pages"), { recursive: true });
mkdirSync(path.join(here, "pdf"), { recursive: true });

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "harkback-eval-fetch" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
}

/** The article only, with the license and the version kept so the file says where it came from. */
function trim(html, paper) {
  const start = html.indexOf('<div class="ltx_page_content">');
  const end = html.lastIndexOf('<footer class="ltx_page_footer"');
  if (start < 0) throw new Error(`${paper.id}: no ltx_page_content`);
  let body = html.slice(start, end > start ? end : undefined);
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<section[^>]*class="ltx_bibliography"[\s\S]*?<\/section>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "");
  return [
    "<!DOCTYPE html>",
    `<html lang="en"><head><meta charset="utf-8"><title>${paper.title}</title>`,
    `<meta name="citation_arxiv_id" content="${paper.id}">`,
    `<link rel="license" href="${paper.license}">`,
    `<!-- arXiv:${paper.id}${paper.version}, ${paper.license}; trimmed to the article for the formula evaluation set. -->`,
    `</head><body>${body}</body></html>`,
    "",
  ].join("\n");
}

/** Text lines of a PDF, top to bottom on each page: items whose baselines are within half a font size are one line. */
async function pdfLines(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items = content.items
      .filter((i) => "str" in i && i.str.trim() !== "" && Math.abs(i.transform[1]) < 1e-6 && Math.abs(i.transform[2]) < 1e-6)
      .map((i) => ({ x: i.transform[4], y: i.transform[5], size: Math.abs(i.transform[3]) || 10, str: i.str }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const item of items) {
      const line = lines.find((l) => Math.abs(l.y - item.y) < Math.min(l.size, item.size) / 2);
      if (line) line.items.push(item);
      else lines.push({ y: item.y, size: item.size, items: [item] });
    }
    lines.sort((a, b) => b.y - a.y);
    pages.push(
      lines.map((l) =>
        l.items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      ),
    );
  }
  return pages;
}

for (const paper of PAPERS) {
  const html = await (await get(`https://arxiv.org/html/${paper.id}${paper.version}`)).text();
  writeFileSync(path.join(here, "pages", `${paper.id}.html`), trim(html, paper));
  const pdf = new Uint8Array(await (await get(`https://arxiv.org/pdf/${paper.id}${paper.version}`)).arrayBuffer());
  const lines = await pdfLines(pdf);
  writeFileSync(
    path.join(here, "pdf", `${paper.id}.json`),
    `${JSON.stringify({ source: `arXiv:${paper.id}${paper.version}`, title: paper.title, license: paper.license, note: EXTRACTED, pages: lines }, null, 1)}\n`,
  );
  process.stdout.write(`${paper.id}${paper.version}: ${lines.length} pages\n`);
  // arXiv asks automated clients to wait a few seconds between requests.
  await new Promise((r) => setTimeout(r, 3000));
}
