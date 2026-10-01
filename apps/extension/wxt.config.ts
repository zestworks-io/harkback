import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "wxt";

const pdfjsDir = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
// Character maps and fonts for PDFs that do not embed them, and the decoders for image formats; the rest of pdf.js is bundled.
const PDFJS_ASSETS = ["cmaps", "standard_fonts", "iccs", "wasm"];
const PDFJS_SKIP = /quickjs/;

export default defineConfig({
  srcDir: "src",
  imports: false,
  hooks: {
    "build:publicAssets": async (_wxt, files) => {
      for (const dir of PDFJS_ASSETS) {
        for (const name of await readdir(path.join(pdfjsDir, dir))) {
          if (!PDFJS_SKIP.test(name)) files.push({ absoluteSrc: path.join(pdfjsDir, dir, name), relativeDest: `pdfjs/${dir}/${name}` });
        }
      }
    },
  },
  manifest: ({ mode }) => ({
    name: "Harkback",
    description: "Explain terms while you read, remember what you understood, and reconnect when you meet them again.",
    permissions: ["storage", "alarms", "downloads", "offscreen", "scripting", "activeTab"],
    optional_host_permissions: ["*://*/*"],
    host_permissions: mode === "e2e" ? ["http://127.0.0.1/*", "*://blog.example.com/*", "*://*.blog.example.com/*"] : [],
    action: { default_title: "Harkback: scan this page" },
    commands: {
      "explain-selection": {
        suggested_key: { default: "Alt+E" },
        description: "Explain the selected text",
      },
    },
  }),
});
