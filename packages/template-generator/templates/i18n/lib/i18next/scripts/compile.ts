/**
 * `i18n:compile` — validates every catalog and writes the normalized export
 * (design D7). Runs before `dev` and `build`; a message outside the ICU subset
 * fails here with its id.
 */

import { sourceLocale, locales } from "../src/config";
import { runExport } from "./export";
import { icuMessagesById, packageRoot, readCatalog } from "./lib/catalogs";

const root = packageRoot();

for (const locale of locales) {
  icuMessagesById(readCatalog(root, locale));
}

console.log(`i18n:compile OK for ${locales.join(", ")} (source ${sourceLocale})`);
console.log(`i18n:compile wrote ${runExport(root)}`);
