/**
 * `i18n:compile` — compiles `locales/<locale>/messages.po` into
 * `locales/<locale>/messages.ts` and refreshes the normalized catalog that the
 * Rust side consumes (`packages/i18n/dist/catalog.json`, D7).
 *
 * Tauri's `beforeDevCommand`/`beforeBuildCommand` also run this script, so the
 * Rust crate always sees the current catalogs.
 */
import { exportCatalog } from "./export";
import { runLinguiCli } from "./lingui-cli";

const status = runLinguiCli(["compile"]);
if (status !== 0) {
  process.exit(status);
}

const exported = exportCatalog();
if (!exported.ok) {
  console.error("i18n:export failed:");
  for (const error of exported.errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Compiled catalogs and exported ${exported.messages} messages.`);
