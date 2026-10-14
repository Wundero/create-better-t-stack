/**
 * `i18n:extract` — runs the i18next-cli extractor over the app sources and
 * updates `locales/<locale>/common.json` with natural-language keys.
 *
 * The extractor walks `apps/**` and `packages/**` from `i18next.config.ts`;
 * extra arguments are forwarded (`--watch`, `--ci`, …).
 */

import { packageRoot } from "./lib/catalogs";

const root = packageRoot();
const forwarded = process.argv.slice(2);

const extractor = Bun.spawn(["bunx", "i18next-cli", "extract", ...forwarded], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await extractor.exited;
if (exitCode !== 0) process.exit(exitCode);

// Task 8.3 (Rust/Tauri) merges `t!(...)` references into the source catalog
// after the extractor runs, so keys used only by the Rust host are never
// pruned. It hooks in here and stays a no-op without the Tauri addon.
