import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const out = "apps/extension/.output/chrome-mv3";
// Only meaningful right after a production build (an e2e build may write to the same folder).
const enabled = process.env.HB_CHECK_BUILD === "1" && existsSync(join(out, "manifest.json"));

describe.skipIf(!enabled)("production manifest", () => {
  const manifest = enabled ? JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) : {};

  it("asks for no host access up front and exposes nothing to web pages", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions).toEqual(["*://*/*", "file:///*"]);
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
    // Entrypoint names like "history" or "newtab" silently become browser page overrides.
    expect(manifest.chrome_url_overrides).toBeUndefined();
    expect(manifest.content_scripts).toEqual([expect.objectContaining({ matches: ["https://arxiv.org/*"] })]);
    expect(manifest.commands["explain-selection"].suggested_key.default).toBe("Alt+Shift+E");
    expect(manifest.commands["preview-page"].suggested_key.default).toBe("Alt+Shift+P");
  });

  it("keeps the schema library out of the script injected into web pages", () => {
    const file = join(out, "content-scripts/content.js");
    expect(readFileSync(file, "utf8")).not.toContain("ZodError");
    expect(statSync(file).size).toBeLessThan(100_000);
  });

  it("uses closed shadow roots in the production content script", () => {
    const dir = join(out, "content-scripts");
    const code = readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    expect(code).toContain("attachShadow");
    // The mode reaches attachShadow through a variable; minifiers may quote the literal with any quote style.
    expect(code).toMatch(/["'`]closed["'`]/);
    expect(code).not.toMatch(/["'`]open["'`]/);
  });
});
