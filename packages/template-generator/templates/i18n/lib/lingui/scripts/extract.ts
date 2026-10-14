/**
 * `i18n:extract` — scans every app for Lingui macros and refreshes
 * `locales/<locale>/messages.po`, removing obsolete entries.
 *
 * Rust extraction hook (lane L8): the Tauri crate ships a `syn`-based
 * extractor that emits `{ source, context?, references[] }` items for
 * `t!(...)`. Once the crate exists, run it here and merge each item through
 * `scripts/po.ts` (`generateMessageId`, `findEntry`, `writeCatalog`) before
 * `--clean` prunes anything, so Rust-only messages are never removed.
 */
import { runLinguiCli } from "./lingui-cli";

process.exitCode = runLinguiCli(["extract", "--clean"]);
