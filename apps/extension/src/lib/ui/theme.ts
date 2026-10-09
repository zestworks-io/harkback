import { browser } from "wxt/browser";
import { withDefaults, type Theme } from "../storage/settings";

/** "system" leaves the choice to the browser's `prefers-color-scheme`; the pages' styles key off `data-theme`. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

/** Applies the saved theme to an extension page and keeps it in step when settings change in another tab. */
export async function initTheme(): Promise<void> {
  const read = (raw: unknown) => withDefaults(raw).theme;
  applyTheme(read((await browser.storage.local.get("settings")).settings));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) applyTheme(read(changes.settings.newValue));
  });
}
