import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOMAINS } from "@harkback/spec";

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("platform guard", () => {
  it("core can import spec", () => {
    expect(DOMAINS).toContain("ml");
  });

  it("src files use no Node-only APIs", () => {
    for (const root of ["packages/spec/src", "packages/core/src", "apps/extension/src"]) {
      for (const file of tsFiles(root)) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/from\s+["']node:|require\(|\bprocess\.|\bBuffer\b/);
      }
    }
  });
});
