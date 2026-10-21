/**
 * `i18n:check` — fails on missing, untranslated or placeholder-invalid entries.
 * `I18N_CHECK_ALLOW_MISSING=1` relaxes missing/untranslated entries during
 * development; placeholder mismatches always fail (design D8).
 */

import { locales, sourceLocale } from "../src/config";
import { checkCatalogs, packageRoot } from "./lib/catalogs";

const allowMissing = process.env.I18N_CHECK_ALLOW_MISSING === "1";
const result = checkCatalogs(packageRoot(), { locales, sourceLocale }, { allowMissing });

for (const problem of result.problems.slice(0, 50)) {
  console.error(`${problem.locale} "${problem.id}": ${problem.reason}`);
}
if (result.problems.length > 0) {
  console.error(`${result.problems.length} problem(s) across ${result.checked} checked entries`);
  process.exit(1);
}
console.log(`i18n:check passed (${result.checked} checked entries)`);
