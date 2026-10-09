// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, withDefaults } from "../../src/lib/storage/settings";
import { applyTheme } from "../../src/lib/ui/theme";

describe("theme", () => {
  it("defaults to the system theme and ignores unknown values", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(withDefaults({}).theme).toBe("system");
    expect(withDefaults({ theme: "purple" }).theme).toBe("system");
    expect(withDefaults({ theme: "dark" }).theme).toBe("dark");
    expect(withDefaults({ theme: "light" }).theme).toBe("light");
  });

  it("sets data-theme for light and dark and removes it for system", () => {
    const root = document.createElement("div");
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});
