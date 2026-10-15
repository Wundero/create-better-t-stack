/**
 * `i18n:compile` — compiles `locales/<locale>/messages.po` into
 * `locales/<locale>/messages.ts` so every bundler can import them statically.
 */
import { runLinguiCli } from "./lingui-cli";

process.exitCode = runLinguiCli(["compile"]);
