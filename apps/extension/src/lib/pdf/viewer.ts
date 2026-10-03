import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";
import type { OcrPage } from "../ocr/store";
import { isImagePage, SPARSE_TEXT } from "../ocr/convert";
import { structurePage } from "./dom";
import type { Scanner } from "./scan";
import type { RawTextItem } from "./text";

const PREFETCH_MARGIN = "1200px 0px";
const MAX_WIDTH = 900;

interface PageState {
  n: number;
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  layer: HTMLElement;
  text?: Promise<number>;
  /** The page is on or near the screen. */
  near: boolean;
  /** The page has no text of its own and has to be read by OCR. */
  image?: boolean;
  scan?: Promise<void>;
  task?: RenderTask;
  drawn: boolean;
}

export interface Viewer {
  /** Resolves when the text of every page has been read; the value is how many characters there were in all. */
  textReady: Promise<number>;
  /** Stops reading and drawing; the pages stay in the document until the caller removes them. */
  destroy(): void;
}

/** How far OCR has got: pages without text found so far, pages read, pages that could not be read, and how sure the reading was. */
export interface ScanProgress {
  found: number;
  done: number;
  failed: number;
  /** Mean confidence over the pages read, 0 to 100; null before the first one. */
  confidence: number | null;
}

export interface ViewerHooks {
  /** More page text is in the document: whoever cached it must read it again. */
  onTextChanged(): void;
  /** Reads pages that have no text. Without it they stay as pictures. */
  scan?: { scanner: Scanner; onProgress(progress: ScanProgress): void };
}

const OCR_FONT = "ocr";

const IMAGE_OPS = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject]);

/** Whether the page draws a picture: a scan with a stamp or a watermark of real text still has one. */
async function drawsImage(page: PDFPageProxy): Promise<boolean> {
  const { fnArray } = await page.getOperatorList();
  return fnArray.some((op) => IMAGE_OPS.has(op));
}

/** What pdf.js's text layer needs to draw lines that OCR found: the same shape `getTextContent` gives. */
function ocrContent(page: OcrPage) {
  return {
    items: page.items.map((i) => ({
      str: i.str,
      dir: "ltr",
      transform: [i.h, 0, 0, i.h, i.x, i.y],
      width: i.w,
      height: i.h,
      fontName: OCR_FONT,
      hasEOL: false,
    })),
    styles: { [OCR_FONT]: { fontFamily: "sans-serif", ascent: 0.9, descent: -0.2, vertical: false } },
    lang: null,
  };
}

/**
 * Draws a PDF as a column of pages. A page is drawn when it comes near the screen and its picture is
 * dropped when it leaves again; the text layer stays, and the text of every page is read in the
 * background so that scanning and context cover the whole document.
 */
export async function mountViewer(doc: PDFDocumentProxy, host: HTMLElement, hooks: ViewerHooks): Promise<Viewer> {
  const first = await doc.getPage(1);
  const width = Math.min(MAX_WIDTH, Math.max(320, window.innerWidth - 32));
  const scale = width / first.getViewport({ scale: 1 }).width;
  const pages: PageState[] = [];
  const progress: ScanProgress = { found: 0, done: 0, failed: 0, confidence: null };
  let confidenceSum = 0;
  let destroyed = false;

  for (let n = 1; n <= doc.numPages; n++) {
    const section = document.createElement("section");
    section.className = "hb-page";
    section.dataset.page = String(n);
    const size = first.getViewport({ scale });
    section.style.cssText = [
      `width:${size.width}px`,
      `height:${size.height}px`,
      `--scale-factor:${scale}`,
      "--user-unit:1",
      "--total-scale-factor:calc(var(--scale-factor) * var(--user-unit))",
      "--scale-round-x:1px",
      "--scale-round-y:1px",
    ].join(";");
    const canvas = document.createElement("canvas");
    const layer = document.createElement("div");
    layer.className = "textLayer";
    section.append(canvas, layer);
    host.append(section);
    pages.push({ n, section, canvas, layer, near: false, drawn: false });
  }

  const pageOf = (n: number): Promise<PDFPageProxy> => (n === 1 ? Promise.resolve(first) : doc.getPage(n));

  async function readText(p: PageState): Promise<number> {
    const page = await pageOf(p.n);
    const viewport = page.getViewport({ scale });
    // The page may be a different size from the first one.
    p.section.style.width = `${viewport.width}px`;
    p.section.style.height = `${viewport.height}px`;
    const content = await page.getTextContent();
    const chars = content.items.reduce((n, i) => n + ("str" in i ? i.str.length : 0), 0);
    if (hooks.scan && (isImagePage(chars) || (chars < SPARSE_TEXT && (await drawsImage(page).catch(() => false))))) {
      // A picture of text: it is read when it comes near the screen, and does not hold up the pages after it.
      p.image = true;
      progress.found++;
      hooks.scan.onProgress({ ...progress });
      return 0;
    }
    await fillLayer(p, content, content.items as RawTextItem[], viewport);
    return chars;
  }

  async function fillLayer(
    p: PageState,
    content: TextContent,
    raw: RawTextItem[],
    viewport: ReturnType<PDFPageProxy["getViewport"]>,
  ): Promise<void> {
    const layer = new pdfjs.TextLayer({ textContentSource: content, container: p.layer, viewport });
    await layer.render();
    structurePage(p.layer, layer.textDivs, raw);
    hooks.onTextChanged();
  }

  function scanPage(p: PageState): Promise<void> {
    const scan = hooks.scan;
    if (!scan || p.scan) return p.scan ?? Promise.resolve();
    p.scan = (async () => {
      await ensureText(p);
      if (!p.image) return;
      const page = await pageOf(p.n);
      // A page that has left the screen is not worth the time; it is asked for again when it comes back.
      const read = await scan.scanner.read(page, () => p.near && !destroyed).catch(() => null);
      if (destroyed) return;
      if (read === undefined) {
        p.scan = undefined;
        return;
      }
      if (read) {
        const content = ocrContent(read);
        await fillLayer(p, content as TextContent, content.items as RawTextItem[], page.getViewport({ scale }));
        progress.done++;
        confidenceSum += read.confidence;
        progress.confidence = confidenceSum / progress.done;
      } else progress.failed++;
      scan.onProgress({ ...progress });
    })();
    return p.scan;
  }

  const ensureText = (p: PageState): Promise<number> => (p.text ??= readText(p).catch(() => 0));

  async function draw(p: PageState): Promise<void> {
    if (p.drawn || p.task) return;
    const page = await pageOf(p.n);
    // It may have scrolled away while the page was being loaded.
    if (!p.near || destroyed || p.drawn || p.task) return;
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * ratio });
    p.canvas.width = Math.floor(viewport.width);
    p.canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvas: p.canvas, viewport });
    p.task = task;
    try {
      await task.promise;
      p.drawn = true;
    } catch {
      // Cancelled because the page left the screen, or a page that cannot be drawn; its text still works.
    } finally {
      p.task = undefined;
    }
    if (!p.near) release(p);
  }

  function release(p: PageState): void {
    p.task?.cancel();
    if (p.drawn) {
      p.canvas.width = 0;
      p.canvas.height = 0;
      p.drawn = false;
    }
  }

  const byElement = new Map(pages.map((p) => [p.section, p]));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const p = byElement.get(e.target as HTMLElement)!;
        p.near = e.isIntersecting;
        if (e.isIntersecting) {
          void ensureText(p);
          void scanPage(p);
          void draw(p);
        } else release(p);
      }
    },
    { rootMargin: PREFETCH_MARGIN },
  );
  pages.forEach((p) => observer.observe(p.section));

  const textReady = (async () => {
    let total = 0;
    for (const p of pages) {
      total += await ensureText(p);
      // Give the page a turn between pages of a long document.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return total;
  })();
  return {
    textReady,
    destroy() {
      destroyed = true;
      observer.disconnect();
      pages.forEach(release);
    },
  };
}
