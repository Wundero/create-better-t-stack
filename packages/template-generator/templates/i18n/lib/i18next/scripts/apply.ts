/**
 * `i18n:apply <file>` — validates translations from the `i18n-translate` skill
 * and writes them into the catalogs (design D8).
 *
 * The file is either `{ "items": [{ id, locale, translation }] }` or a bare
 * array of the same items. Items whose `{{placeholders}}` differ from the
 * source are rejected and stay pending.
 */

import { readFileSync } from "node:fs";

import { locales, sourceLocale } from "../src/config";
import { applyTranslations, packageRoot, type ApplyItem } from "./lib/catalogs";

interface ApplyPayload {
  readonly items?: readonly ApplyItem[];
}

const [file] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
if (!file) {
  console.error("usage: i18n:apply <file>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(file, "utf8")) as readonly ApplyItem[] | ApplyPayload;
const candidates = Array.isArray(payload) ? payload : (payload.items ?? []);
// Decode at the file boundary: an item is usable only with all three fields.
const items = candidates.filter(
  (item) => Boolean(item.id) && Boolean(item.locale) && Boolean(item.translation),
);

const result = applyTranslations(packageRoot(), { locales, sourceLocale }, items);
for (const rejection of result.rejected) {
  console.error(`rejected ${rejection.locale} "${rejection.id}": ${rejection.reason}`);
}
console.log(
  `Applied ${result.appliedCount} translation(s)` +
    (result.rejected.length > 0 ? `, rejected ${result.rejected.length}` : ""),
);
if (result.rejected.length > 0) process.exit(1);
