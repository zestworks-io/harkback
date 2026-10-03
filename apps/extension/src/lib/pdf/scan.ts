import type { PDFPageProxy } from "pdfjs-dist";
import { fromOcr } from "../ocr/convert";
import type { Engine } from "../ocr/engine";
import { getPage, putPage, type OcrPage } from "../ocr/store";

/** A page is drawn for OCR at about 200 dpi, but never more than this many pixels on its longer side. */
const TARGET_DPI = 200;
const MAX_SIDE = 3000;
const RETRY_SHRINK = 0.6;
/** An engine that has not started, or a page that has not been read, after this long is given up on. */
const START_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 120_000;

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export interface ScanDeps {
  /** Identifies the document in the cache. */
  doc: string;
  languages: readonly string[];
  start(): Promise<Engine>;
}

export interface Scanner {
  /**
   * The text of a page: from the cache, or read now. `wanted` is asked once more when the page's turn comes; if it says no
   * the page is left alone and the answer is undefined. Null means OCR could not read it.
   */
  read(page: PDFPageProxy, wanted?: () => boolean): Promise<OcrPage | null | undefined>;
  stop(): Promise<void>;
}

async function recognise(page: PDFPageProxy, engine: Engine, shrink: number): Promise<OcrPage> {
  const unit = page.getViewport({ scale: 1 });
  const scale = Math.min(TARGET_DPI / 72, MAX_SIDE / Math.max(unit.width, unit.height)) * shrink;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  try {
    await page.render({ canvas, viewport }).promise;
    const lines = await within(engine.recognize(canvas), PAGE_TIMEOUT_MS);
    return fromOcr(lines, (px, py) => viewport.convertToPdfPoint(px, py) as [number, number]);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Reads the text of image pages, one at a time, and keeps what it read. The engine starts when the first page needs it;
 * if it cannot start, every page answers null and the reader carries on without OCR.
 */
export function createScanner(deps: ScanDeps): Scanner {
  let engine: Promise<Engine | null> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const engineOnce = () => (engine ??= within(deps.start(), START_TIMEOUT_MS).catch(() => null));

  return {
    read(page, wanted) {
      const run = async (): Promise<OcrPage | null | undefined> => {
        const cached = await getPage(deps.doc, page.pageNumber, deps.languages).catch(() => null);
        if (cached) return cached;
        if (wanted && !wanted()) return undefined;
        const e = await engineOnce();
        if (wanted && !wanted()) return undefined;
        if (!e) return null;
        let result: OcrPage;
        try {
          result = await recognise(page, e, 1);
        } catch {
          // A very large page may have run out of memory; once more, smaller.
          try {
            result = await recognise(page, e, RETRY_SHRINK);
          } catch {
            return null;
          }
        }
        await putPage(deps.doc, page.pageNumber, deps.languages, result).catch(() => undefined);
        return result;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
    async stop() {
      const e = await engine;
      await e?.terminate();
    },
  };
}
