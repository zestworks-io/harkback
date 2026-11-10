import { browser } from "wxt/browser";
import { request, requestOrigins } from "../../lib/pages/request";
import { hostPermissionPatterns, siteName } from "../../lib/source/site-rules";
import { withDefaults } from "../../lib/storage/settings";
import { h } from "../../lib/ui/dom";
import { applyLanguage } from "../../lib/ui/languages";
import { pick } from "../../lib/ui/pick";
import { initTheme } from "../../lib/ui/theme";

/** Asks to show reunion hints on one site by themselves. Opened from the preview panel, which cannot ask the browser itself. */
async function main(): Promise<void> {
  void initTheme();
  const lang = withDefaults((await browser.storage.local.get("settings")).settings).language;
  applyLanguage(document.documentElement, lang);
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  const root = document.getElementById("app")!;
  const params = new URLSearchParams(location.search);
  const site = siteName(params.get("site"));
  // Back to the page it was opened from, then away: a tab opened by the extension may not close itself with window.close().
  const close = async (): Promise<void> => {
    const self = await browser.tabs.getCurrent().catch(() => undefined);
    if (self?.openerTabId !== undefined) await browser.tabs.update(self.openerTabId, { active: true }).catch(() => undefined);
    if (self?.id !== undefined) await browser.tabs.remove(self.id).catch(() => window.close());
    else window.close();
  };

  if (!site) {
    root.replaceChildren(
      h("p", {}, L("这个窗口打开时没有指定网站。", "This window was opened without a site.")),
      h("div", { className: "actions" }, h("button", { type: "button", onclick: () => void close() }, L("关闭", "Close"))),
    );
    return;
  }

  document.title = `Harkback · ${site}`;
  const status = h("p", { className: "status", "data-hb": "site-access-status", role: "status" });
  const allow = h("button", { type: "button", className: "primary", "data-hb": "site-allow" }, L("允许", "Allow"));
  allow.addEventListener("click", async () => {
    // The first await: the browser asks only while the click still counts.
    const granted = await requestOrigins(hostPermissionPatterns(site));
    if (!granted) {
      status.textContent = L("浏览器没有授予访问权限，所以什么都没改。", "The browser did not give access, so nothing changed.");
      return;
    }
    allow.disabled = true;
    const r = await request({ type: "enable-site", site });
    if (r.ok) return close();
    allow.disabled = false;
    status.textContent = L("没能保存，请再试一次。", "It could not be saved; please try again.");
  });

  root.replaceChildren(
    h("h1", { "data-hb": "site-access-title" }, L("在 {site} 上显示重逢提示？", "Show reunion hints on {site}?", { site })),
    h(
      "p",
      {},
      L(
        "你查过的术语出现在这个网站上时会直接标出来，不用先点 Harkback 的按钮。",
        "Terms you have looked up before will be underlined whenever they appear on this site, without clicking Harkback first.",
      ),
    ),
    h(
      "p",
      { className: "note" },
      L(
        "查找这些术语只在你的电脑上进行。除非你按“解释”或“扫描”，页面文字不会发送到任何地方。接下来浏览器会请你允许 Harkback 访问这个网站。",
        "Finding them happens on your computer: no page text is sent anywhere unless you press Explain or Scan. Your browser will then ask you to allow Harkback on this site.",
      ),
    ),
    status,
    h(
      "div",
      { className: "actions" },
      h("button", { type: "button", "data-hb": "site-not-now", onclick: () => void close() }, L("以后再说", "Not now")),
      allow,
    ),
  );
  allow.focus();
}

void main();
