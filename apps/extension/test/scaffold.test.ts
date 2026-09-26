import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("extension package", () => {
  it("declares the license and depends on the shared packages", () => {
    const pkg = JSON.parse(readFileSync("apps/extension/package.json", "utf8"));
    expect(pkg.license).toBe("Apache-2.0");
    expect(pkg.dependencies["@harkback/core"]).toBe("workspace:*");
    expect(pkg.dependencies["@harkback/spec"]).toBe("workspace:*");
  });
});
