import { compactDeleted, createEventFactory, newDeviceId, type EventFactory } from "@harkback/core";
import type { HarkEvent } from "@harkback/spec";

/** Pages that show the records listen here; the background announces every write. */
export const CHANGE_CHANNEL = "harkback-events";

const EVENTS = "events";
const META = "meta";
const IDENTITY = "identity";

interface Identity {
  key: typeof IDENTITY;
  device: string;
  seq: number;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

export class EventStore {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly now: () => number,
  ) {}

  static async open(o: { name?: string; factory?: IDBFactory; now?: () => number } = {}): Promise<EventStore> {
    const request = (o.factory ?? indexedDB).open(o.name ?? "harkback", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(EVENTS, { keyPath: "id" }).createIndex("device_seq", ["device", "seq"], { unique: true });
      db.createObjectStore(META, { keyPath: "key" });
    };
    const store = new EventStore(await req(request), o.now ?? Date.now);
    await store.ensureIdentity();
    return store;
  }

  /** The device id and its seq counter live in one store; a missing or lagging counter gets a fresh device id. */
  private async ensureIdentity(): Promise<void> {
    const tx = this.db.transaction([EVENTS, META], "readwrite");
    const done = completion(tx);
    const meta = tx.objectStore(META);
    const identity = (await req(meta.get(IDENTITY))) as Identity | undefined;
    let valid = false;
    if (identity) {
      const range = IDBKeyRange.bound([identity.device, -Infinity], [identity.device, Infinity]);
      const cursor = await req(tx.objectStore(EVENTS).index("device_seq").openCursor(range, "prev"));
      const maxSeq = cursor ? (cursor.value as HarkEvent).seq : 0;
      valid = identity.seq >= maxSeq;
    }
    if (!valid) meta.put({ key: IDENTITY, device: newDeviceId("dev"), seq: 0 } satisfies Identity);
    await done;
  }

  async identity(): Promise<{ device: string; seq: number }> {
    const tx = this.db.transaction(META);
    const identity = (await req(tx.objectStore(META).get(IDENTITY))) as Identity;
    return { device: identity.device, seq: identity.seq };
  }

  /** Builds and writes events in one transaction; `build` runs synchronously inside it. */
  async append(build: (factory: EventFactory) => HarkEvent[]): Promise<HarkEvent[]> {
    const tx = this.db.transaction([EVENTS, META], "readwrite");
    const done = completion(tx);
    const meta = tx.objectStore(META);
    const identity = (await req(meta.get(IDENTITY))) as Identity;
    let seq = identity.seq;
    let events: HarkEvent[];
    try {
      events = build(createEventFactory({ device: identity.device, nextSeq: () => ++seq, now: this.now }));
    } catch (e) {
      tx.abort();
      await done.catch(() => undefined);
      throw e;
    }
    const store = tx.objectStore(EVENTS);
    for (const e of events) store.add(e);
    meta.put({ ...identity, seq });
    await done;
    return events;
  }

  /**
   * Adds events that came from elsewhere (a backup). Events already here, and ones that would reuse a device's sequence number
   * for a different event, are skipped. Returns how many were added.
   */
  async importEvents(events: readonly HarkEvent[]): Promise<number> {
    const tx = this.db.transaction([EVENTS, META], "readwrite");
    const done = completion(tx);
    const meta = tx.objectStore(META);
    const store = tx.objectStore(EVENTS);
    const identity = (await req(meta.get(IDENTITY))) as Identity;
    let added = 0;
    let ownSeq = identity.seq;
    await Promise.all(
      events.map(
        (e) =>
          new Promise<void>((resolve) => {
            const r = store.add(e);
            r.onsuccess = () => {
              added++;
              if (e.device === identity.device) ownSeq = Math.max(ownSeq, e.seq);
              resolve();
            };
            r.onerror = (ev) => {
              // A duplicate must not abort the whole import.
              ev.preventDefault();
              ev.stopPropagation();
              resolve();
            };
          }),
      ),
    );
    // Events from this device's own earlier life: new events must number after them.
    if (ownSeq !== identity.seq) meta.put({ ...identity, seq: ownSeq });
    await done;
    return added;
  }

  async all(): Promise<HarkEvent[]> {
    const tx = this.db.transaction(EVENTS);
    return (await req(tx.objectStore(EVENTS).getAll())) as HarkEvent[];
  }

  /** Clears payloads of deleted encounters and their actions in place; returns how many events changed. */
  async compact(): Promise<number> {
    const tx = this.db.transaction(EVENTS, "readwrite");
    const done = completion(tx);
    const store = tx.objectStore(EVENTS);
    const all = (await req(store.getAll())) as HarkEvent[];
    let changed = 0;
    compactDeleted(all).forEach((e, i) => {
      if (e !== all[i]) {
        store.put(e);
        changed++;
      }
    });
    await done;
    return changed;
  }

  close(): void {
    this.db.close();
  }
}
