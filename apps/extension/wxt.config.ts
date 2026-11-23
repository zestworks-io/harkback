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
/**
 * Tesseract falls back to scripts on a CDN when it is not given paths. Harkback always gives it the copies inside the
 * extension, but Manifest V3 review flags the fallback addresses themselves, so they are taken out of what ships.
 * Each must be found exactly once, so a Tesseract update that moves them fails the build instead of shipping them.
 */
function stripRemoteCode(code: string, file: string, fallbacks: readonly (readonly [RegExp, string])[]): string {
  for (const [fallback, replacement] of fallbacks) {
    const found = code.match(new RegExp(fallback.source, fallback.flags.replace("g", "") + "g"))?.length ?? 0;
    if (found !== 1) throw new Error(`${file}: expected one ${fallback} to strip, found ${found}`);
    code = code.replace(fallback, () => replacement);
  }
  return code;
}
/** Only reached when a path was not given: fail with the reason rather than load a file that does not exist. */
const required = (option: string): string => `(()=>{throw new Error("Harkback: Tesseract's ${option} must be set")})()`;
const patchedWorker = path.join(import.meta.dirname, ".wxt/ocr/worker.min.js");
writeFileSync(
  patchedWorker,
  stripRemoteCode(readFileSync(path.join(tesseractDir, "dist/worker.min.js"), "utf8"), "tesseract.js/dist/worker.min.js", [
    // The default core script and the default language host; both are only used when corePath or langPath is unset.
    [/"https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js-core@v"\.concat\([^)]*\)\)/, required("corePath")],
    [/"https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data\/"\.concat\([^()]*\)/, required("langPath")],
    // The map is not shipped, and its offsets no longer fit the edited file.
    [/\n\/\/# sourceMappingURL=worker\.min\.js\.map\s*$/, "\n"],
  ]),
);
const tesseractDefaults = path.join(tesseractDir, "src/worker/browser/defaultOptions.js");
/**
 * The default worker script and the read of Tesseract's whole package.json that builds it. The default is evaluated
 * when the module loads, so it cannot throw; it is empty instead, and workerPath is always set.
 */
const WORKER_FALLBACKS = [
  [/`https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@v\$\{version\}\/dist\/worker\.min\.js`/, '""'],
  [/require\('\.\.\/\.\.\/\.\.\/package\.json'\)\.version/, '""'],
] as const;

// What OCR needs to run without a network: its worker, the one WebAssembly core (with SIMD) and the English pack.
const OCR_ASSETS = [
  { absoluteSrc: patchedWorker, relativeDest: "ocr/worker.min.js" },
  { absoluteSrc: path.join(tesseractCoreDir, "tesseract-core-simd-lstm.wasm.js"), relativeDest: "ocr/tesseract-core-simd-lstm.wasm.js" },
  { absoluteSrc: unpackedPack, relativeDest: "ocr/eng.traineddata" },
];

export default defineConfig({
  srcDir: "src",
  imports: false,
  vite: () => {
    let stripped = false;
    return {
      plugins: [
        {
          name: "harkback:strip-tesseract-cdn",
          enforce: "pre",
          buildStart() {
            stripped = false;
          },
          transform(code, id) {
            if (path.resolve(id.split("?")[0]!) !== tesseractDefaults) return null;
            stripped = true;
            return { code: stripRemoteCode(code, "tesseract.js/src/worker/browser/defaultOptions.js", WORKER_FALLBACKS), map: null };
          },
          // If Tesseract is bundled from somewhere this plugin does not see, its CDN default would ship unnoticed.
          buildEnd() {
            const tesseract = [...this.getModuleIds()].some((id) => id.startsWith(tesseractDir + path.sep));
            if (tesseract && !stripped) this.error(`tesseract.js was bundled without passing through ${tesseractDefaults}`);
          },
        },
      ],
    };
  },
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
    host_permissions:
      mode === "e2e"
        ? [
            "http://127.0.0.1/*",
            "*://blog.example.com/*",
            "*://*.blog.example.com/*",
            "*://example.github.io/*",
            "*://*.example.github.io/*",
            "*://youtube.com/*",
            "*://*.youtube.com/*",
            "*://github.com/*",
            "*://notion.so/*",
            "*://*.notion.so/*",
            "*://*.notion.site/*",
            "*://docs.google.com/*",
            "https://api.zotero.org/*",
          ]
        : [],
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
