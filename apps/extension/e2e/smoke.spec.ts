import { expect, test, type ChromeApi } from "./harness";

test("the service worker starts, opens onboarding on install and schedules backups", async ({ context, sw }) => {
  expect(sw.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
  const onboarding =
    context.pages().find((p) => p.url().endsWith("/onboarding.html")) ??
    (await context.waitForEvent("page", { predicate: (p) => p.url().endsWith("/onboarding.html") }));
  expect(onboarding.url()).toContain("onboarding.html");
  await expect
    .poll(() => sw.evaluate(async () => Boolean(await (globalThis as unknown as { chrome: ChromeApi }).chrome.alarms.get("backup"))))
    .toBe(true);
});
