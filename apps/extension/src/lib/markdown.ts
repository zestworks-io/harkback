import { h } from "./dom";
import { renderMath } from "./math";

const WORD = String.raw`[\p{L}\p{N}_]`;
const CODE = /(`[^`\n]+`)/.source;
// `_` only emphasises at word edges, so snake_case stays text; `$` only opens a formula when it hugs its content and is not followed by a digit, so prices stay text.
const INLINE = new RegExp(
  [
    CODE,
    String.raw`(\$(?:[^\s$]|[^\s$][^$\n]*?[^\s$])\$(?!\d)|\\\([^\n]+?\\\))`,
    String.raw`(\*\*[^*\n]+\*\*|(?<!${WORD})__[^_\n]+__(?!${WORD}))`,
    String.raw`(\*[^*\s][^*\n]*\*|(?<!${WORD})_[^_\s](?:[^_\n]*[^_\s])?_(?!${WORD}))`,
    String.raw`(!?\[[^\]\n]*\]\((?:[^()\s]|\([^()\s]*\))*\))`,
  ].join("|"),
  "gu",
);
const LINK = /^(!?)\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)$/;

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function renderInline(text: string, parent: Node): void {
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) parent.appendChild(document.createTextNode(text.slice(last, at)));
    const tok = m[0];
    if (m[1]) parent.appendChild(h("code", {}, tok.slice(1, -1)));
    else if (m[2]) parent.appendChild(renderMath(tok.startsWith("$") ? tok.slice(1, -1) : tok.slice(2, -2), false));
    else if (m[3]) {
      const strong = h("strong");
      renderInline(tok.slice(2, -2), strong);
      parent.appendChild(strong);
    } else if (m[4]) {
      const em = h("em");
      renderInline(tok.slice(1, -1), em);
      parent.appendChild(em);
    } else {
      const lm = LINK.exec(tok);
      const label = lm?.[2] || lm?.[3] || tok;
      // Images are never loaded: they render as their alt text.
      const url = lm && !lm[1] ? safeUrl(lm[3] ?? "") : null;
      parent.appendChild(
        url ? h("span", { className: "hb-link", "data-url": url, role: "link", tabindex: "0" }, label) : document.createTextNode(label),
      );
    }
    last = at + tok.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

const isFence = (l: string) => /^\s*```/.test(l);
const isMathFence = (l: string) => /^\s*(\$\$|\\\[)/.test(l);
const mathClose = (open: string) => (/^\s*\\\[/.test(open) ? /\\\]\s*$/ : /\$\$\s*$/);
const isList = (l: string) => /^\s*[-*+]\s+/.test(l);
const isOrdered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isHeading = (l: string) => /^\s*#{1,6}\s+/.test(l);
const startsBlock = (l: string) => isFence(l) || isMathFence(l) || isList(l) || isOrdered(l) || isHeading(l);
const indentOf = (l: string): number => /^[ \t]*/.exec(l)![0].replace(/\t/g, "    ").length;
const stripMarker = (l: string): string => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");

/** A list at `indent`; lines indented further become a nested list inside the item above them. */
function renderList(lines: string[], start: number, indent: number): [HTMLElement, number] {
  const ordered = isOrdered(lines[start]!);
  const list = ordered ? h("ol") : h("ul");
  let item: HTMLElement | null = null;
  let i = start;
  while (i < lines.length) {
    const l = lines[i]!;
    if (!isList(l) && !isOrdered(l)) break;
    const at = indentOf(l);
    if (at < indent) break;
    if (at > indent && item) {
      const [sub, next] = renderList(lines, i, at);
      item.append(sub);
      i = next;
      continue;
    }
    if (isOrdered(l) !== ordered) break;
    item = h("li");
    renderInline(stripMarker(l), item);
    list.append(item);
    i++;
  }
  return [list, i];
}

const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const isTableStart = (lines: string[], i: number): boolean =>
  lines[i]!.includes("|") &&
  i + 1 < lines.length &&
  lines[i + 1]!.includes("-") &&
  TABLE_RULE.test(lines[i + 1]!) &&
  (lines[i + 1]!.includes("|") || tableCells(lines[i]!).length > 1);

function renderTable(lines: string[], start: number): [HTMLElement, number] {
  const head = h("tr");
  for (const c of tableCells(lines[start]!)) {
    const th = h("th");
    renderInline(c, th);
    head.append(th);
  }
  const body = h("tbody");
  let i = start + 2;
  while (i < lines.length && lines[i]!.trim() && lines[i]!.includes("|")) {
    const row = h("tr");
    for (const c of tableCells(lines[i]!)) {
      const td = h("td");
      renderInline(c, td);
      row.append(td);
    }
    body.append(row);
    i++;
  }
  return [h("div", { className: "hb-table" }, h("table", {}, h("thead", {}, head), body)), i];
}

/** Restricted Markdown: paragraphs, emphasis, lists, inline code, code blocks and formulas. No HTML, images or live links. */
export function renderMarkdown(src: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const oneLineMath = /^\s*(?:\$\$(.+)\$\$|\\\[(.+)\\\])\s*$/.exec(line);
    if (oneLineMath) {
      frag.append(renderMath((oneLineMath[1] ?? oneLineMath[2])!.trim(), true));
      i++;
      continue;
    }
    if (isFence(line) || isMathFence(line)) {
      const math = isMathFence(line);
      const closes = math ? mathClose(line) : null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !(closes ? closes.test(lines[i]!) : isFence(lines[i]!))) body.push(lines[i++]!);
      i++;
      frag.append(math ? renderMath(body.join(" ").trim(), true) : h("pre", {}, h("code", {}, body.join("\n"))));
      continue;
    }
    if (isList(line) || isOrdered(line)) {
      const [list, next] = renderList(lines, i, indentOf(line));
      frag.append(list);
      i = next;
      continue;
    }
    if (isTableStart(lines, i)) {
      const [table, next] = renderTable(lines, i);
      frag.append(table);
      i = next;
      continue;
    }
    if (isHeading(line)) {
      const strong = h("strong");
      renderInline(line.replace(/^\s*#{1,6}\s+/, ""), strong);
      frag.append(h("p", {}, strong));
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!) && !isTableStart(lines, i)) para.push(lines[i++]!.trim());
    const p = h("p");
    renderInline(para.join(" "), p);
    frag.append(p);
  }
  return frag;
}
