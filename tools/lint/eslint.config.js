import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/.output/**", "**/.wxt/**", "**/node_modules/**", "**/test-results/**", "packages/spec/schema/**", "docs/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "warn",
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Playwright fixtures must destructure their arguments, even when they use none.
    files: ["apps/extension/e2e/harness.ts"],
    rules: { "no-empty-pattern": "off" },
  },
);
