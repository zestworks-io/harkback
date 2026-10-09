import { describe, expect, it } from "vitest";
import { createScanner } from "../../src/lib/pdf/scan";

const page = { pageNumber: 1 } as never;

describe("scanner", () => {
  it("answers null for every page when the engine cannot start, and only tries once", async () => {
    let starts = 0;
    const scanner = createScanner({
      doc: "doc",
      languages: ["eng"],
      start: async () => {
        starts++;
        throw new Error("no wasm");
      },
    });
    expect(await scanner.read(page)).toBeNull();
    expect(await scanner.read({ pageNumber: 2 } as never)).toBeNull();
    expect(starts).toBe(1);
    await expect(scanner.stop()).resolves.toBeUndefined();
  });
});
