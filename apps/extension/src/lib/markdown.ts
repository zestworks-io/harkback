import { h } from "./dom";

const INLINE = /(`[^`\n]+`)|(\$[^$\n]+\$)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(!?\[[^\]\n]*\]\([^)\s]*\))/g;
const LINK = /^(!?)\[([^\]\n]*)\]\(([^)\s]*)\)$/;

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function renderInline(text: string, parent: Node): void {
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) parent.appendChild(document.createTextNode(text.slice(last, at)));
    const tok = m[0];
    if (m[1]) parent.appendChild(h("code", {}, tok.slice(1, -1)));
    else if (m[2]) parent.appendChild(h("code", { className: "hb-math" }, tok.slice(1, -1)));
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
      parent.appendChild(url ? h("span", { className: "hb-link", "data-url": url, role: "link", tabindex: "0" }, label) : document.createTextNode(label));
    }
    last = at + tok.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

const isFence = (l: string) => /^\s*```/.test(l);
const isMathFence = (l: string) => /^\s*\$\$/.test(l);
const isList = (l: string) => /^\s*[-*+]\s+/.test(l);
const isOrdered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isHeading = (l: string) => /^\s*#{1,6}\s+/.test(l);
const startsBlock = (l: string) => isFence(l) || isMathFence(l) || isList(l) || isOrdered(l) || isHeading(l);

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
    const oneLineMath = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
    if (oneLineMath) {
      frag.append(h("div", { className: "hb-math-block" }, oneLineMath[1]!.trim()));
      i++;
      continue;
    }
    if (isFence(line) || isMathFence(line)) {
      const math = isMathFence(line);
      const body: string[] = [];
      i++;
      while (i < lines.length && !(math ? isMathFence(lines[i]!) : isFence(lines[i]!))) body.push(lines[i++]!);
      i++;
      frag.append(math ? h("div", { className: "hb-math-block" }, body.join("\n")) : h("pre", {}, h("code", {}, body.join("\n"))));
      continue;
    }
    if (isList(line) || isOrdered(line)) {
      const ordered = isOrdered(line);
      const list = ordered ? h("ol") : h("ul");
      while (i < lines.length && (ordered ? isOrdered(lines[i]!) : isList(lines[i]!))) {
        const li = h("li");
        renderInline(lines[i]!.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""), li);
        list.append(li);
        i++;
      }
      frag.append(list);
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
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!)) para.push(lines[i++]!.trim());
    const p = h("p");
    renderInline(para.join(" "), p);
    frag.append(p);
  }
  return frag;
}
