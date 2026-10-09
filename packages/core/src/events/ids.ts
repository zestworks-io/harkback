import { RELS, type Rel } from "@harkback/spec";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function ulid(now: number = Date.now(), random: (n: number) => Uint8Array = defaultRandom): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD.charAt((bytes[i] ?? 0) % 32);
  return time + rand;
}

export function newDeviceId(prefix: "dev" | "svc" = "dev", random: (n: number) => Uint8Array = defaultRandom): string {
  const hex = Array.from(random(8), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function edgeId(from: string, rel: Rel, to: string): string {
  return `${from}>${rel}>${to}`;
}

export function parseEdgeId(id: string): { from: string; rel: Rel; to: string } | null {
  const parts = id.split(">");
  if (parts.length !== 3) return null;
  const [from, rel, to] = parts as [string, string, string];
  if (!from || !to || !(RELS as readonly string[]).includes(rel)) return null;
  return { from, rel: rel as Rel, to };
}
