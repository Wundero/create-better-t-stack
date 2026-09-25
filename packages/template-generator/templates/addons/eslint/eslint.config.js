import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/.nx/**",
      "**/dev-dist/**",
      "**/.zed/**",
      "**/.vscode/**",
      "**/routeTree.gen.ts",
      "**/src-tauri/**",
      "**/.nuxt/**",
      "bts.jsonc",
      "**/.expo/**",
      "**/.wrangler/**",
      "**/.alchemy/**",
      "**/.svelte-kit/**",
      "**/wrangler.jsonc",
      "**/.source/**",
      "**/convex/_generated/**",
      "**/.wxt/**",
      "**/*.vue",
      "**/*.svelte",
      "**/*.astro",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-nocheck": false, "ts-ignore": false },
      ],
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "always" }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  eslintConfigPrettier,
);
