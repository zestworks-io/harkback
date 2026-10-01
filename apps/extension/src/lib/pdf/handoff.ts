/**
 * The background downloads a PDF while the browser still lets it read the tab, then the reader page
 * picks the file up here. Both run in the extension's own origin, so they share this database.
 */
const DB = "harkback-pdf";
const STORE = "handoff";
const KEEP_MS = 10 * 60_000;

interface Entry {
  id: string;
  data: string;
  at: number;
}

interface Options {
  factory?: IDBFactory;
  now?: () => number;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

/** Stores a file (as a data: URL) and returns the id the reader asks for. Files nobody collected are dropped here. */
export async function putHandoff(data: string, o: Options = {}): Promise<string> {
  const now = (o.now ?? Date.now)();
  const db = await open(o.factory ?? indexedDB);
  try {
    const id = crypto.randomUUID();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const all = store.getAll();
    all.onsuccess = () => {
      for (const e of all.result as Entry[]) if (now - e.at > KEEP_MS) store.delete(e.id);
      store.put({ id, data, at: now } satisfies Entry);
    };
    await done(tx);
    return id;
  } finally {
    db.close();
  }
}

/** Returns the file once and removes it. */
export async function takeHandoff(id: string, o: Options = {}): Promise<string | null> {
  const db = await open(o.factory ?? indexedDB);
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let found: Entry | undefined;
    const get = store.get(id);
    get.onsuccess = () => {
      found = get.result as Entry | undefined;
      if (found) store.delete(id);
    };
    await done(tx);
    return found?.data ?? null;
  } finally {
    db.close();
  }
}
