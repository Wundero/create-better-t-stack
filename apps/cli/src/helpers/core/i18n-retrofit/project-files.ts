import path from "node:path";

import fs from "fs-extra";
import { glob } from "tinyglobby";

/** Text/config extensions that participate in i18n retrofitting. */
const INCLUDE_PATTERNS = [
  "**/*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc,toml,yaml,yml,svelte,vue,astro,md,mdx,css,html}",
];

/** Build output, caches and dependencies never need to be preloaded. */
const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/.turbo/**",
  "**/.expo/**",
  "**/.wxt/**",
  "**/.svelte-kit/**",
  "**/.react-router/**",
  "**/.vinxi/**",
  "**/.cache/**",
  "**/coverage/**",
];

/**
 * Read the project's current text files so the create-path processors see the
 * same tree they would patch during generation. Binary assets are skipped.
 */
export async function loadProjectTextFiles(projectDir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const matches = await glob(INCLUDE_PATTERNS, {
    cwd: projectDir,
    dot: true,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
  });

  for (const relativePath of matches) {
    const key = relativePath.replace(/\\/g, "/");
    try {
      files.set(key, await fs.readFile(path.join(projectDir, relativePath), "utf-8"));
    } catch {
      // Ignore unreadable files; they simply won't be patchable.
    }
  }

  return files;
}
