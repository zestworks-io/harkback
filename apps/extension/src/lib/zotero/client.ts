import type { ZoteroItem } from "./highlights";

export const ZOTERO_API = "https://api.zotero.org";
/** The address pattern the page asks the browser for before it reads a library. */
export const ZOTERO_ORIGIN = `${ZOTERO_API}/*`;

/** `key`: the key is wrong or was revoked. `no-library`: it cannot read the library. `busy`: Zotero asked to wait too long. */
export type ZoteroErrorCode = "key" | "no-library" | "network" | "busy" | "server";

/** A library the key can read: the reader's own, or a group's. */
export interface ZoteroLibrary {
  type: "user" | "group";
  id: number;
  /** A group's name; empty for the reader's own library. */
  name: string;
}

/** The path the API names a library by, and the key its progress is kept under: `users/123` or `groups/456`. */
export const libraryPath = (lib: Pick<ZoteroLibrary, "type" | "id">): string => `${lib.type}s/${lib.id}`;

/** A group's name as shown and recorded: never empty, never longer than a term may say. */
const groupName = (name: unknown, id: number): string =>
  (typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 200) : "") || `Group ${id}`;

export class ZoteroError extends Error {
  constructor(readonly code: ZoteroErrorCode) {
    super(`zotero: ${code}`);
  }
}

export interface ZoteroClientOptions {
  key: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** At most this many items in one page, and keys in one `itemKey` request (the service's limits). */
const PAGE = 100;
const KEYS_PER_REQUEST = 50;
/** Waits Zotero asks for are honoured up to this long; a longer one ends the import with `busy`. */
const MAX_WAIT_MS = 60_000;
const RETRIES = 3;

const seconds = (v: string | null): number | null => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The `rel="next"` address of a `Link` header, if it stays on the API. */
function nextLink(header: string | null): string | null {
  for (const part of header?.split(",") ?? []) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m && m[1]!.startsWith(`${ZOTERO_API}/`)) return m[1]!;
  }
  return null;
}

/**
 * Reads a personal library through the Zotero web API (version 3), with the waits it asks for: `Backoff` before the next
 * request, and `Retry-After` (or a growing wait) after 429 and 503.
 */
export function zoteroClient(o: ZoteroClientOptions) {
  const fetchFn = o.fetch ?? fetch.bind(globalThis);
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  let calmUntil = 0;

  async function wait(ms: number): Promise<void> {
    if (ms > MAX_WAIT_MS) throw new ZoteroError("busy");
    if (ms > 0) await sleep(ms);
  }

  async function get(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      await wait(calmUntil - now());
      let res: Response;
      try {
        res = await fetchFn(url, { headers: { "Zotero-API-Version": "3", "Zotero-API-Key": o.key }, credentials: "omit" });
      } catch {
        throw new ZoteroError("network");
      }
      const backoff = seconds(res.headers.get("Backoff"));
      if (backoff !== null) calmUntil = now() + backoff * 1000;
      if (res.status === 429 || res.status === 503) {
        if (attempt + 1 >= RETRIES) throw new ZoteroError("busy");
        await wait((seconds(res.headers.get("Retry-After")) ?? 2 ** attempt * 5) * 1000);
        continue;
      }
      if (res.status === 403) throw new ZoteroError("key");
      if (!res.ok) throw new ZoteroError("server");
      return res;
    }
  }

  async function json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ZoteroError("server");
    }
  }

  return {
    /**
     * The libraries the key can read: its owner's own (when it may) and the groups it may. A key that can read none
     * fails with `no-library`.
     */
    async libraries(): Promise<{ userID: number; libraries: ZoteroLibrary[] }> {
      type Access = { library?: unknown };
      const body = await json<{ userID?: unknown; access?: { user?: Access; groups?: Record<string, Access> } }>(
        await get(`${ZOTERO_API}/keys/current`),
      );
      if (typeof body.userID !== "number") throw new ZoteroError("server");
      const userID = body.userID;
      // The server leaves out what the key may not read: `user` without personal access, `groups` without group access.
      const libraries: ZoteroLibrary[] = body.access?.user?.library === true ? [{ type: "user", id: userID, name: "" }] : [];
      const groups = body.access?.groups ?? {};
      const readable = (id: number) => groups.all?.library === true || groups[String(id)]?.library === true;
      if (Object.keys(groups).length > 0) {
        let url: string | null = `${ZOTERO_API}/users/${userID}/groups?limit=${PAGE}`;
        while (url) {
          const res = await get(url);
          for (const g of await json<{ id?: unknown; data?: { name?: unknown } }[]>(res)) {
            if (typeof g.id === "number" && readable(g.id))
              libraries.push({ type: "group", id: g.id, name: groupName(g.data?.name, g.id) });
          }
          url = nextLink(res.headers.get("Link"));
        }
      }
      if (libraries.length === 0) throw new ZoteroError("no-library");
      return { userID, libraries };
    },

    /** Every annotation changed after library version `since` (all of them for 0), and the library's version now. */
    async annotations(lib: ZoteroLibrary, since: number): Promise<{ items: ZoteroItem[]; version: number }> {
      let url: string | null =
        `${ZOTERO_API}/${libraryPath(lib)}/items?itemType=annotation&limit=${PAGE}${since > 0 ? `&since=${since}` : ""}`;
      const items: ZoteroItem[] = [];
      let version = since;
      for (let first = true; url; first = false) {
        const res = await get(url);
        if (first) version = seconds(res.headers.get("Last-Modified-Version")) ?? since;
        items.push(...(await json<ZoteroItem[]>(res)));
        url = nextLink(res.headers.get("Link"));
      }
      return { items, version };
    },

    /** The items with these keys; a key that is not there (deleted meanwhile) is left out. */
    async items(lib: ZoteroLibrary, keys: readonly string[]): Promise<ZoteroItem[]> {
      const unique = [...new Set(keys)];
      const out: ZoteroItem[] = [];
      for (let i = 0; i < unique.length; i += KEYS_PER_REQUEST) {
        const batch = unique
          .slice(i, i + KEYS_PER_REQUEST)
          .map(encodeURIComponent)
          .join(",");
        out.push(...(await json<ZoteroItem[]>(await get(`${ZOTERO_API}/${libraryPath(lib)}/items?itemKey=${batch}&limit=${PAGE}`))));
      }
      return out;
    },
  };
}

export type ZoteroClient = ReturnType<typeof zoteroClient>;

/** The highlights and the files and papers they hang from, read in three steps. */
export async function readLibrary(
  client: ZoteroClient,
  lib: ZoteroLibrary,
  since: number,
): Promise<{ annotations: ZoteroItem[]; items: Map<string, ZoteroItem>; version: number }> {
  const { items: annotations, version } = await client.annotations(lib, since);
  const items = new Map<string, ZoteroItem>();
  const fetchKeys = async (keys: (string | undefined)[]) => {
    const wanted = keys.filter((k): k is string => typeof k === "string" && !items.has(k));
    for (const item of await client.items(lib, wanted)) items.set(item.key, item);
  };
  // A highlight hangs from its file, and the file from its paper (a file added on its own has none).
  await fetchKeys(annotations.map((a) => a.data.parentItem));
  await fetchKeys([...items.values()].map((f) => f.data.parentItem));
  return { annotations, items, version };
}
