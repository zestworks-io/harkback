import { defineConfig } from "@playwright/test";

/** Takes the Chrome Web Store screenshots: `pnpm --filter @harkback/extension store-assets`. */
export default defineConfig({
  testDir: "store-assets",
  timeout: 120_000,
  workers: 1,
  reporter: "line",
});
