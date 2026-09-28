import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  imports: false,
  manifest: ({ mode }) => ({
    name: "Harkback",
    description: "Explain terms while you read, remember what you understood, and reconnect when you meet them again.",
    permissions: ["storage", "alarms", "downloads", "offscreen", "scripting", "activeTab"],
    optional_host_permissions: ["*://*/*"],
    host_permissions: mode === "e2e" ? ["http://127.0.0.1/*", "*://blog.example.com/*", "*://*.blog.example.com/*"] : [],
    action: { default_title: "Harkback: scan this page" },
    commands: {
      "explain-selection": {
        suggested_key: { default: "Alt+E" },
        description: "Explain the selected text",
      },
    },
  }),
});
