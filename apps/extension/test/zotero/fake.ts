import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ZoteroItem } from "../../src/lib/zotero/highlights";

// Vitest defines __dirname; Playwright loads this file as an ES module, which has import.meta.dirname.
const DIR = join(typeof __dirname === "string" ? __dirname : import.meta.dirname, "../../fixtures/zotero");
export const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
export const USER = 4242424;
const API = "https://api.zotero.org";

/** A fake api.zotero.org serving the fixtures with the headers the service sends. */
export function fakeZotero(o: { keys?: string; status?: number[]; headers?: Record<string, string>[] } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const pool = new Map(fixture<ZoteroItem[]>("items.json").map((i) => [i.key, i]));
  const statuses = [...(o.status ?? [])];
  const extra = [...(o.headers ?? [])];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, headers: init?.headers as Record<string, string> });
    const status = statuses.shift() ?? 200;
    const headers = new Headers({ "Last-Modified-Version": "965", ...(extra.shift() ?? {}) });
    if (status !== 200) return new Response(status === 403 ? "Invalid key" : "", { status, headers });
    const u = new URL(url);
    let body: unknown;
    if (u.pathname === "/keys/current") body = fixture(o.keys ?? "keys-current.json");
    else if (u.searchParams.get("itemType") === "annotation") {
      const start = Number(u.searchParams.get("start") ?? 0);
      const since = Number(u.searchParams.get("since") ?? 0);
      const all = [...fixture<ZoteroItem[]>("annotations-1.json"), ...fixture<ZoteroItem[]>("annotations-2.json")].filter(
        (a) => (a.version ?? 0) > since,
      );
      body = all.slice(start, start + 5);
      headers.set("Total-Results", String(all.length));
      const base = `${API}/users/${USER}/items?itemType=annotation&limit=5`;
      headers.set(
        "Link",
        start + 5 < all.length
          ? `<${base}&start=${start + 5}>; rel="next", <${base}&start=5>; rel="last", <https://www.zotero.org/reader/items>; rel="alternate"`
          : `<https://www.zotero.org/reader/items>; rel="alternate"`,
      );
    } else if (u.searchParams.has("itemKey")) {
      // Only the keys found come back, in the service's own order.
      body = (u.searchParams.get("itemKey") ?? "")
        .split(",")
        .flatMap((k) => (pool.has(k) ? [pool.get(k)!] : []))
        .reverse();
    } else return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers });
  };
  const slept: number[] = [];
  return { fetch, calls, slept, sleep: async (ms: number) => void slept.push(ms) };
}
