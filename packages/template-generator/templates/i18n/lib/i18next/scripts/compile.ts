/**
 * `i18n:compile` — i18next resolves keys at runtime, so there is no build step;
 * this validates that every configured locale catalog is present and parseable
 * before `dev` and `build` run.
 */

import { sourceLocale, locales } from "../src/config";
import { packageRoot, readCatalog } from "./lib/catalogs";

const root = packageRoot();

for (const locale of locales) {
  readCatalog(root, locale);
}

console.log(`i18n:compile OK for ${locales.join(", ")} (source ${sourceLocale})`);
