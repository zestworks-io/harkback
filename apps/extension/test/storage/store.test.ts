import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { parseEvent } from "@harkback/spec";
import { ulid } from "@harkback/core";
import { StateCache } from "../../src/lib/storage/state-cache";
import { EventStore } from "../../src/lib/storage/store";

const now = () => Date.UTC(2026, 8, 25);
const muted = (f: Parameters<Parameters<EventStore["append"]>[0]>[0]) => f.make("concept.muted", { concept_id: ulid() });

async function setMetaSeq(factory: IDBFactory, seq: number): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = factory.open("harkback", 1);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    const get = store.get("identity");
    get.onsuccess = () => store.put({ ...get.result, seq });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe("EventStore.importEvents", () => {
  it("adds new events, skips ones it has, and numbers later events after its own imported ones", async () => {
    const factory = new IDBFactory();
    const a = await EventStore.open({ factory, now });
    await a.append((f) => [muted(f), muted(f), muted(f)]);
    const backup = await a.all();
    const device = (await a.identity()).device;
    a.close();

    // A fresh browser profile restoring the backup, then the same backup again.
    const fresh = await EventStore.open({ factory: new IDBFactory(), now });
    expect(await fresh.importEvents(backup)).toBe(3);
    expect(await fresh.importEvents(backup)).toBe(0);
    expect(await fresh.all()).toHaveLength(3);
    const written = await fresh.append((f) => [muted(f)]);
    expect(new Set(written.map((e) => e.device)).has(device)).toBe(false);
    expect(await fresh.all()).toHaveLength(4);
  });

  it("keeps counting after events of its own device that it did not have", async () => {
    const factory = new IDBFactory();
    const store = await EventStore.open({ factory, now });
    const { device } = await store.identity();
    const foreign = [{ ...(await store.append((f) => [muted(f)]))[0]!, id: ulid(), seq: 40 }];
    expect(foreign[0]!.device).toBe(device);
    expect(await store.importEvents(foreign)).toBe(1);
    const next = await store.append((f) => [muted(f)]);
    expect(next[0]!.seq).toBe(41);
  });
});

describe("EventStore", () => {
  it("assigns increasing seq numbers from one device and writes schema-valid events", async () => {
    const store = await EventStore.open({ factory: new IDBFactory(), now });
    const written = await store.append((f) => [muted(f), muted(f)]);
    const more = await store.append((f) => [muted(f)]);
    expect([...written, ...more].map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(new Set([...written, ...more].map((e) => e.device)).size).toBe(1);
    const all = await store.all();
    expect(all).toHaveLength(3);
    for (const e of all) expect(parseEvent(e).kind).toBe("event");
    expect(await store.identity()).toEqual({ device: written[0]!.device, seq: 3 });
  });

  it("keeps its identity across reopen", async () => {
    const factory = new IDBFactory();
    const first = await EventStore.open({ factory, now });
    const [e] = await first.append((f) => [muted(f)]);
    first.close();
    const second = await EventStore.open({ factory, now });
    const [next] = await second.append((f) => [muted(f)]);
    expect(next!.device).toBe(e!.device);
    expect(next!.seq).toBe(2);
  });

  it("switches to a new device id when the counter lags behind stored events", async () => {
    const factory = new IDBFactory();
    const first = await EventStore.open({ factory, now });
    const [e] = await first.append((f) => [muted(f), muted(f), muted(f)]);
    first.close();
    await setMetaSeq(factory, 1);
    const second = await EventStore.open({ factory, now });
    const identity = await second.identity();
    expect(identity.device).not.toBe(e!.device);
    expect(identity.seq).toBe(0);
    const [next] = await second.append((f) => [muted(f)]);
    expect(next!.seq).toBe(1);
  });

  it("writes nothing when the builder throws", async () => {
    const store = await EventStore.open({ factory: new IDBFactory(), now });
    await expect(
      store.append((f) => {
        muted(f);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await store.all()).toEqual([]);
    expect((await store.identity()).seq).toBe(0);
  });

  it("compacts deleted encounters in place", async () => {
    const store = await EventStore.open({ factory: new IDBFactory(), now });
    const conceptId = ulid();
    const encounterId = ulid();
    await store.append((f) => [
      f.make("concept.created", { concept_id: conceptId, canonical_name: "LoRA", aliases: [], domain: "ml" }),
      f.make("encounter.created", {
        encounter_id: encounterId,
        concept_id: conceptId,
        source_id: "arxiv:1",
        locator: { exact: "LoRA", prefix: "", suffix: "" },
        selection: "LoRA",
        explanation: { text: "secret", tier: "external_knowledge", evidence_span: null, model: "m" },
        flags: [],
      }),
      f.make("encounter.deleted", { encounter_id: encounterId }),
    ]);
    expect(await store.compact()).toBe(1);
    expect(await store.compact()).toBe(0);
    const created = (await store.all()).find((e) => e.type === "encounter.created");
    expect(created?.payload).toBeNull();
  });
});

describe("StateCache", () => {
  it("replays once and again after invalidation", async () => {
    let reads = 0;
    const store = await EventStore.open({ factory: new IDBFactory(), now });
    const counting = { all: () => ((reads += 1), store.all()) };
    const cache = new StateCache(counting);
    await store.append((f) => [f.make("concept.created", { concept_id: ulid(), canonical_name: "LoRA", aliases: [], domain: "ml" })]);
    expect((await cache.get()).concepts.size).toBe(1);
    await cache.get();
    expect(reads).toBe(1);
    await store.append((f) => [f.make("concept.created", { concept_id: ulid(), canonical_name: "QLoRA", aliases: [], domain: "ml" })]);
    cache.invalidate();
    expect((await cache.get()).concepts.size).toBe(2);
    expect(reads).toBe(2);
  });
});
