import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { structurePage } from "./dom";
import type { RawTextItem } from "./text";

const PREFETCH_MARGIN = "1200px 0px";
const MAX_WIDTH = 900;

interface PageState {
  n: number;
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  layer: HTMLElement;
  text?: Promise<number>;
  task?: RenderTask;
  drawn: boolean;
}

export interface Viewer {
  /** Resolves when the text of every page has been read; the value is how many characters there were in all. */
  textReady: Promise<number>;
}

export interface ViewerHooks {
  /** More page text is in the document: whoever cached it must read it again. */
  onTextChanged(): void;
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
    pages.push({ n, section, canvas, layer, drawn: false });
  }

  const pageOf = (n: number): Promise<PDFPageProxy> => (n === 1 ? Promise.resolve(first) : doc.getPage(n));

  async function readText(p: PageState): Promise<number> {
    const page = await pageOf(p.n);
    const viewport = page.getViewport({ scale });
    // The page may be a different size from the first one.
    p.section.style.width = `${viewport.width}px`;
    p.section.style.height = `${viewport.height}px`;
    const content = await page.getTextContent();
    const layer = new pdfjs.TextLayer({ textContentSource: content, container: p.layer, viewport });
    await layer.render();
    structurePage(p.layer, layer.textDivs, content.items as RawTextItem[]);
    hooks.onTextChanged();
    return content.items.reduce((n, i) => n + ("str" in i ? i.str.length : 0), 0);
  }

  const ensureText = (p: PageState): Promise<number> => (p.text ??= readText(p).catch(() => 0));

  async function draw(p: PageState): Promise<void> {
    if (p.drawn || p.task) return;
    const page = await pageOf(p.n);
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
        if (e.isIntersecting) {
          void ensureText(p);
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
  return { textReady };
}
