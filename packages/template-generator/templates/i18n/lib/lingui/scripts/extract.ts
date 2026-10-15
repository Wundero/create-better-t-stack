/**
 * `i18n:extract` — scans every app for Lingui macros and refreshes
 * `locales/<locale>/messages.po`, removing obsolete entries.
 */
import { runLinguiCli } from "./lingui-cli";

process.exitCode = runLinguiCli(["extract", "--clean"]);
