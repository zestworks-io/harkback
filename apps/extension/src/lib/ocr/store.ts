/**
 * What OCR keeps on this machine: downloaded language packs, the text read from each page, and the languages
 * chosen for each document. Everything here can be fetched or computed again, so none of it is backed up.
 */
const DB = "harkback-ocr";
const PACKS = "packs";
const PAGES = "pages";
const CHOICES = "choices";

export interface OcrItem {
  str: string;
  /** Left edge and baseline in PDF units, y upwards. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrPage {
  items: OcrItem[];
  /** Mean confidence, 0 to 100. */
  confidence: number;
}

interface Options {
  factory?: IDBFactory;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(PACKS, { keyPath: "code" });
      db.createObjectStore(PAGES, { keyPath: "key" });
      db.createObjectStore(CHOICES, { keyPath: "doc" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });

const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function withDb<T>(o: Options, fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await open(o.factory ?? indexedDB);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export const putPack = (code: string, data: Uint8Array, o: Options = {}): Promise<void> =>
  withDb(o, async (db) => {
    const tx = db.transaction(PACKS, "readwrite");
    tx.objectStore(PACKS).put({ code, data, at: Date.now() });
    await done(tx);
  });

export const getPack = (code: string, o: Options = {}): Promise<Uint8Array | null> =>
  withDb(o, async (db) => {
    const found = await result(db.transaction(PACKS).objectStore(PACKS).get(code));
    return (found as { data: Uint8Array } | undefined)?.data ?? null;
  });

export const installedPacks = (o: Options = {}): Promise<string[]> =>
  withDb(o, async (db) => (await result(db.transaction(PACKS).objectStore(PACKS).getAllKeys())) as string[]);

/** Removes a pack and every page that was read with it. */
export const removePack = (code: string, o: Options = {}): Promise<void> =>
  withDb(o, async (db) => {
    const tx = db.transaction([PACKS, PAGES], "readwrite");
    tx.objectStore(PACKS).delete(code);
    const pages = tx.objectStore(PAGES);
    const all = pages.getAll();
    all.onsuccess = () => {
      for (const p of all.result as { key: string; langs: string[] }[]) if (p.langs.includes(code)) pages.delete(p.key);
    };
    await done(tx);
  });

const pageKey = (doc: string, page: number, langs: readonly string[]): string => `${doc}|${page}|${langs.join("+")}`;

export const putPage = (doc: string, page: number, langs: readonly string[], value: OcrPage, o: Options = {}): Promise<void> =>
  withDb(o, async (db) => {
    const tx = db.transaction(PAGES, "readwrite");
    tx.objectStore(PAGES).put({ key: pageKey(doc, page, langs), doc, langs: [...langs], ...value });
    await done(tx);
  });

export const getPage = (doc: string, page: number, langs: readonly string[], o: Options = {}): Promise<OcrPage | null> =>
  withDb(o, async (db) => {
    const found = (await result(
      db
        .transaction(PAGES)
        .objectStore(PAGES)
        .get(pageKey(doc, page, langs)),
    )) as (OcrPage & { key: string }) | undefined;
    return found ? { items: found.items, confidence: found.confidence } : null;
  });

export const putChoice = (doc: string, langs: readonly string[], o: Options = {}): Promise<void> =>
  withDb(o, async (db) => {
    const tx = db.transaction(CHOICES, "readwrite");
    tx.objectStore(CHOICES).put({ doc, langs: [...langs] });
    await done(tx);
  });

export const getChoice = (doc: string, o: Options = {}): Promise<string[] | null> =>
  withDb(o, async (db) => {
    const found = (await result(db.transaction(CHOICES).objectStore(CHOICES).get(doc))) as { langs: string[] } | undefined;
    return found?.langs ?? null;
  });
