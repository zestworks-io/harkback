import { languageByCode, packUrls, type OcrLanguage } from "./languages";
import { putPack } from "./store";

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

export class PackError extends Error {
  constructor(readonly kind: "unknown" | "download" | "mismatch") {
    super(kind);
  }
}

/** How long one host may take, download included, before the next is tried. */
const ATTEMPT_MS = 45_000;

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
  // Each host in turn; one that cannot be reached or serves the wrong file hands over to the next.
  // A host that stalls is given up on after a while, so the next one gets its turn. The error is that of the last host tried.
  let failure = new PackError("download");
  for (const url of packUrls(code)) {
    let bytes: ArrayBuffer;
    try {
      const res = await (deps.fetch ?? fetch)(url, { credentials: "omit", signal: AbortSignal.timeout(ATTEMPT_MS) });
      if (!res.ok) {
        failure = new PackError("download");
        continue;
      }
      bytes = await res.arrayBuffer();
    } catch {
      failure = new PackError("download");
      continue;
    }
    if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== lang.sha256) {
      failure = new PackError("mismatch");
      continue;
    }
    await (deps.store ?? ((c, d) => putPack(c, d)))(code, new Uint8Array(bytes));
    return;
  }
  throw failure;
}
