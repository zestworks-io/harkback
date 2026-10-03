import { createWorker, type Worker } from "tesseract.js";
import type { OcrLine } from "./convert";

export interface EngineUrls {
  /** Tesseract's worker script, inside the extension. */
  worker: string;
  /** The WebAssembly core, as the one script that carries it. */
  core: string;
  /** The English pack that ships with the extension. */
  bundledPack: string;
}

export interface Engine {
  recognize(image: HTMLCanvasElement): Promise<OcrLine[]>;
  terminate(): Promise<void>;
}

export class MissingPack extends Error {
  constructor(readonly code: string) {
    super(`language pack ${code} is not installed`);
  }
}

/**
 * Tesseract looks for a language in an IndexedDB cache (idb-keyval's default store) before it downloads anything, and
 * its own way of being handed the bytes is not usable. So the packs that were checked on install are put there under
 * a prefix of our own, and the worker is told to read the cache and never write it.
 */
const CACHE_DB = "keyval-store";
const CACHE_STORE = "keyval";
const CACHE_PATH = "harkback";

async function seedCache(entries: ReadonlyMap<string, Uint8Array>): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB);
    request.onupgradeneeded = () => request.result.createObjectStore(CACHE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    for (const [code, data] of entries) tx.objectStore(CACHE_STORE).put(data, `${CACHE_PATH}/${code}.traineddata`);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    });
  } finally {
    db.close();
  }
}

/**
 * Starts a Tesseract worker for a set of languages. Every pack comes from this extension: English from the file it
 * ships with, the others from the copies that were downloaded and checked. `loadPack` returns the bytes of a downloaded
 * pack, or null if it is not installed.
 */
export async function startEngine(
  langs: readonly string[],
  urls: EngineUrls,
  loadPack: (code: string) => Promise<Uint8Array | null>,
): Promise<Engine> {
  const packs = new Map<string, Uint8Array>();
  for (const code of langs) {
    if (code === "eng") packs.set(code, new Uint8Array(await (await fetch(urls.bundledPack)).arrayBuffer()));
    else {
      const data = await loadPack(code);
      if (!data) throw new MissingPack(code);
      packs.set(code, data);
    }
  }
  await seedCache(packs);
  const worker: Worker = await createWorker([...langs], 1, {
    workerPath: urls.worker,
    corePath: urls.core,
    // A miss in the cache must fail here and not reach for the network.
    langPath: new URL(".", urls.bundledPack).href,
    cachePath: CACHE_PATH,
    cacheMethod: "readOnly",
    workerBlobURL: false,
    gzip: true,
  });
  return {
    async recognize(image) {
      const { data } = await worker.recognize(image, {}, { blocks: true });
      return (data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) =>
          p.lines.map((l) => ({
            text: l.text,
            bbox: l.bbox,
            confidence: l.confidence,
            ...(l.baseline ? { baseline: l.baseline } : {}),
            ...(l.rowAttributes ? { rowHeight: l.rowAttributes.rowHeight } : {}),
          })),
        ),
      );
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}
