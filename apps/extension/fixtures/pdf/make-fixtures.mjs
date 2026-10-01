// Writes the PDF fixtures used by the tests: node fixtures/pdf/make-fixtures.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/[\\()]/g, "\\$&");
const text = (x, y, size, str) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(str)}) Tj ET`;

/** Lines of one paragraph, top to bottom, `lead` points apart. */
function lines(x, y, size, lead, rows) {
  return rows.map((r, i) => text(Array.isArray(r) ? r[0] : x, y - i * lead, size, Array.isArray(r) ? r[1] : r)).join("\n");
}

function pdf(pages, title) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const content of pages) {
    const page = objects.length + 1;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`);
    add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  const info = add(`<< /Title (${esc(title)}) >>`);
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const paper = pdf(
  [
    [
      text(72, 730, 16, "Adapters for Small Language Models"),
      text(72, 690, 13, "1 Introduction"),
      lines(72, 668, 10, 12, [
        "Low-rank adaptation (LoRA) freezes the pretrained weights and injects small trainable",
        "matrices into every layer, which keeps the number of trainable parameters tiny. We study",
        "how this choice affects fine-tuning quality on small language models and report that the",
        "results hold across three model families.",
      ]),
      lines(72, 596, 10, 12, [
        [82, "A second paragraph starts with an indent and compares the method with full fine-"],
        "tuning on a comparable budget of trainable parameters. The gap stays small on every task",
        "we tried, even when the rank is reduced to a single dimension for all attention layers.",
      ]),
    ].join("\n"),
    [
      text(72, 730, 13, "2 Method"),
      lines(72, 708, 10, 12, [
        "Each adapted layer adds a product of two thin matrices to its frozen weight. LoRA needs no",
        "extra inference latency because the product can be merged into the weight after training.",
      ]),
    ].join("\n"),
  ],
  "Adapters for Small Language Models",
);

const columns = pdf(
  [
    [
      lines(72, 700, 10, 12, [
        "The left column opens the page and",
        "explains attention in a few plain lines",
        "so that the reader can follow the rest",
        "of the argument without any detours.",
      ]),
      lines(72, 640, 10, 12, [
        [82, "A new paragraph begins here and talks"],
        "about softmax over the scores of every",
        "query and key pair in the sequence.",
      ]),
      lines(330, 700, 10, 12, [
        "The right column continues after the left",
        "one and describes the feed-forward block",
        "that follows attention in each layer of the",
        "network, applied to every position alone.",
      ]),
    ].join("\n"),
  ],
  "Two Column Notes",
);

writeFileSync(path.join(here, "paper.pdf"), paper);
writeFileSync(path.join(here, "columns.pdf"), columns);
