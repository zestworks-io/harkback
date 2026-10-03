import { languageByCode, packUrl, type OcrLanguage } from "./languages";
import { putPack } from "./store";

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

export class PackError extends Error {
  constructor(readonly kind: "unknown" | "download" | "mismatch") {
    super(kind);
  }
}

interface Deps {
  fetch?: typeof fetch;
  store?: (code: string, data: Uint8Array) => Promise<void>;
  lookup?: (code: string) => OcrLanguage | undefined;
}

/**
 * Downloads a language pack, checks it against the hash the extension ships, and only then keeps it. A pack that does
 * not match, whether because the network changed it or the file is damaged, is never stored and never reaches the OCR engine.
 */
export async function installPack(code: string, deps: Deps = {}): Promise<void> {
  const lang = (deps.lookup ?? languageByCode)(code);
  if (!lang) throw new PackError("unknown");
  let bytes: ArrayBuffer;
  try {
    const res = await (deps.fetch ?? fetch)(packUrl(code), { credentials: "omit" });
    if (!res.ok) throw new PackError("download");
    bytes = await res.arrayBuffer();
  } catch (e) {
    throw e instanceof PackError ? e : new PackError("download");
  }
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== lang.sha256) throw new PackError("mismatch");
  await (deps.store ?? ((c, d) => putPack(c, d)))(code, new Uint8Array(bytes));
}
