import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { installPack, PackError } from "../src/lib/ocr/install";
import { normalizeLanguages, OCR_LANGUAGES, packUrl, type OcrLanguage } from "../src/lib/ocr/languages";
import { getChoice, getPack, getPage, installedPacks, putChoice, putPack, putPage, removePack } from "../src/lib/ocr/store";

const fresh = () => ({ factory: new IDBFactory() as unknown as IDBFactory });
const page = { items: [{ str: "a", x: 1, y: 2, w: 3, h: 4 }], confidence: 90 };

describe("OCR language catalog", () => {
  it("has a download address and a checksum for every language, with no repeats", () => {
    expect(new Set(OCR_LANGUAGES.map((l) => l.code)).size).toBe(OCR_LANGUAGES.length);
    for (const l of OCR_LANGUAGES) {
      expect(l.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(packUrl(l.code)).toBe(
        `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${l.code}@1.0.0/4.0.0_best_int/${l.code}.traineddata.gz`,
      );
    }
    expect(OCR_LANGUAGES.slice(0, 2).map((l) => l.code)).toEqual(["chi_sim", "chi_tra"]);
  });

  it("keeps known languages once, and falls back to English", () => {
    expect(normalizeLanguages(["chi_sim", "eng", "chi_sim", "xx"])).toEqual(["chi_sim", "eng"]);
    expect(normalizeLanguages([])).toEqual(["eng"]);
    expect(normalizeLanguages(["xx"])).toEqual(["eng"]);
  });
});

describe("OCR store", () => {
  it("keeps packs and lists them", async () => {
    const o = fresh();
    expect(await installedPacks(o)).toEqual([]);
    await putPack("jpn", new Uint8Array([1, 2, 3]), o);
    expect(await installedPacks(o)).toEqual(["jpn"]);
    expect([...(await getPack("jpn", o))!]).toEqual([1, 2, 3]);
    expect(await getPack("kor", o)).toBeNull();
  });

  it("keeps the text of a page for the languages it was read with only", async () => {
    const o = fresh();
    await putPage("doc", 3, ["eng"], page, o);
    expect(await getPage("doc", 3, ["eng"], o)).toEqual(page);
    expect(await getPage("doc", 3, ["chi_sim", "eng"], o)).toBeNull();
    expect(await getPage("doc", 4, ["eng"], o)).toBeNull();
    expect(await getPage("other", 3, ["eng"], o)).toBeNull();
  });

  it("removes a pack together with the pages that were read with it", async () => {
    const o = fresh();
    await putPack("chi_sim", new Uint8Array([1]), o);
    await putPage("doc", 1, ["chi_sim", "eng"], page, o);
    await putPage("doc", 2, ["eng"], page, o);
    await removePack("chi_sim", o);
    expect(await installedPacks(o)).toEqual([]);
    expect(await getPage("doc", 1, ["chi_sim", "eng"], o)).toBeNull();
    expect(await getPage("doc", 2, ["eng"], o)).toEqual(page);
  });

  it("remembers the languages chosen for a document", async () => {
    const o = fresh();
    expect(await getChoice("doc", o)).toBeNull();
    await putChoice("doc", ["chi_sim", "eng"], o);
    expect(await getChoice("doc", o)).toEqual(["chi_sim", "eng"]);
  });
});

describe("installPack", () => {
  const body = new Uint8Array([7, 7, 7, 7]);
  const known = async (): Promise<OcrLanguage> => ({
    code: "kor",
    native: "한국어",
    size: body.length,
    sha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))].map((b) => b.toString(16).padStart(2, "0")).join(""),
  });
  const serve = (response: () => Response | Promise<Response>) => (async () => response()) as unknown as typeof fetch;

  it("keeps a pack whose checksum matches", async () => {
    const lang = await known();
    const stored: Record<string, Uint8Array> = {};
    let asked = "";
    await installPack("kor", {
      lookup: () => lang,
      fetch: (async (url: string) => {
        asked = url;
        return new Response(body);
      }) as unknown as typeof fetch,
      store: async (code, data) => void (stored[code] = data),
    });
    expect(asked).toBe(packUrl("kor"));
    expect([...stored.kor!]).toEqual([7, 7, 7, 7]);
  });

  it("throws away a pack whose checksum does not match", async () => {
    const stored: string[] = [];
    await expect(
      installPack("kor", {
        lookup: () => ({ ...OCR_LANGUAGES[0]!, code: "kor" }),
        fetch: serve(() => new Response(body)),
        store: async (code) => void stored.push(code),
      }),
    ).rejects.toMatchObject({ kind: "mismatch" });
    expect(stored).toEqual([]);
  });

  it("reports a failed download, and a language it does not know", async () => {
    await expect(installPack("kor", { fetch: serve(() => new Response("", { status: 404 })) })).rejects.toMatchObject({ kind: "download" });
    await expect(installPack("kor", { fetch: serve(() => Promise.reject(new TypeError("offline"))) })).rejects.toBeInstanceOf(PackError);
    await expect(installPack("xx")).rejects.toMatchObject({ kind: "unknown" });
  });
});
