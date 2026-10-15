/**
 * `i18n:pending --locale <locale> | --all [--limit N]` — machine-readable list
 * of untranslated messages for the `i18n-translate` skill (design D8).
 */

import { sourceLocale, locales } from "../src/config";
import { collectPending, packageRoot } from "./lib/catalogs";

const args = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const limitValue = flagValue("--limit");
const items = collectPending(
  packageRoot(),
  { locales, sourceLocale },
  {
    locale: flagValue("--locale"),
    all: args.includes("--all"),
    limit: limitValue ? Number.parseInt(limitValue, 10) : undefined,
  },
);

console.log(JSON.stringify({ library: "i18next", sourceLocale, items }, null, 2));
