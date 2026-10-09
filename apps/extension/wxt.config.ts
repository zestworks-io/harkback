import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "wxt";

const pdfjsDir = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
// Character maps and fonts for PDFs that do not embed them, and the decoders for image formats; the rest of pdf.js is bundled.
const PDFJS_ASSETS = ["cmaps", "standard_fonts", "iccs", "wasm"];
const PDFJS_SKIP = /quickjs/;

const tesseractDir = path.dirname(createRequire(import.meta.url).resolve("tesseract.js/package.json"));
const tesseractCoreDir = path.dirname(createRequire(path.join(tesseractDir, "package.json")).resolve("tesseract.js-core/package.json"));
const englishPack = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0_best_int/eng.traineddata.gz",
);
// Edge Add-ons rejects a package that holds a compressed file, so the pack ships unpacked. Tesseract accepts either form.
const unpackedPack = path.join(import.meta.dirname, ".wxt/ocr/eng.traineddata");
mkdirSync(path.dirname(unpackedPack), { recursive: true });
writeFileSync(unpackedPack, gunzipSync(readFileSync(englishPack)));
// What OCR needs to run without a network: its worker, the one WebAssembly core (with SIMD) and the English pack.
const OCR_ASSETS = [
  { absoluteSrc: path.join(tesseractDir, "dist/worker.min.js"), relativeDest: "ocr/worker.min.js" },
  { absoluteSrc: path.join(tesseractCoreDir, "tesseract-core-simd-lstm.wasm.js"), relativeDest: "ocr/tesseract-core-simd-lstm.wasm.js" },
  { absoluteSrc: unpackedPack, relativeDest: "ocr/eng.traineddata" },
];

export default defineConfig({
  srcDir: "src",
  imports: false,
  hooks: {
    "build:publicAssets": async (_wxt, files) => {
      files.push(...OCR_ASSETS);
      for (const dir of PDFJS_ASSETS) {
        for (const name of await readdir(path.join(pdfjsDir, dir))) {
          if (!PDFJS_SKIP.test(name)) files.push({ absoluteSrc: path.join(pdfjsDir, dir, name), relativeDest: `pdfjs/${dir}/${name}` });
        }
      }
    },
  },
  zip: { artifactTemplate: "harkback-{{version}}-{{browser}}.zip" },
  manifest: ({ mode }) => ({
    name: "Harkback",
    description: "Explain terms while you read, remember what you understood, and reconnect when you meet them again.",
    homepage_url: "https://zestworks-io.github.io/harkback/",
    permissions: ["storage", "alarms", "downloads", "offscreen", "scripting", "activeTab", "contextMenus"],
    // OCR runs WebAssembly; nothing else in the policy is loosened.
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    optional_host_permissions: ["*://*/*", "file:///*"],
    host_permissions: mode === "e2e" ? ["http://127.0.0.1/*", "*://blog.example.com/*", "*://*.blog.example.com/*"] : [],
    action: { default_title: "Harkback: scan this page" },
    commands: {
      "explain-selection": {
        suggested_key: { default: "Alt+Shift+E" },
        description: "Explain the selected text",
      },
      "preview-page": {
        suggested_key: { default: "Alt+Shift+P" },
        description: "Preview the concepts on this page",
      },
    },
  }),
});
