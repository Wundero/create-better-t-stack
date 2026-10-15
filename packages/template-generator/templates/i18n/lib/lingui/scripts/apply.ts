/**
 * `i18n:apply <file>` — writes translations produced by the `i18n-translate`
 * skill back into the catalogs.
 *
 * Input (`{ "items": [...] }`, the same `id`/`locale` the pending contract
 * emits):
 *
 *   { "items": [{ "id": "vQhkQx", "locale": "fr", "translation": "Bonjour" }] }
 *
 * An item is rejected — and its catalog entry stays untouched — when the
 * translation's ICU argument set differs from the source, when it uses a
 * construct outside the exported ICU subset, or when the ID/locale does not
 * exist. Rejections exit non-zero after the accepted items are written.
 */
import { readFileSync } from "node:fs";

import { isConfiguredLocale, readCatalog, sourceLocale, writeCatalog } from "./catalogs";
import { icuSignature, validateIcuSubset } from "./icu";
import { findEntry, sourceTextOf, type PoCatalog } from "./po";

export interface ApplyItem {
  id: string;
  locale: string;
  translation: string;
  context?: string | null;
}

export interface ApplyResult {
  accepted: number;
  rejected: { id: string; locale: string; reason: string }[];
}

export function applyTranslations(items: readonly ApplyItem[]): ApplyResult {
  const sourceCatalog = readCatalog(sourceLocale);
  const catalogs = new Map<string, PoCatalog>();
  const dirty = new Set<string>();
  const result: ApplyResult = { accepted: 0, rejected: [] };

  const catalogFor = (locale: string): PoCatalog => {
    let catalog = catalogs.get(locale);
    if (!catalog) {
      catalog = readCatalog(locale);
      catalogs.set(locale, catalog);
    }
    return catalog;
  };

  for (const item of items) {
    const reject = (reason: string): void => {
      result.rejected.push({ id: item.id, locale: item.locale, reason });
    };

    if (!isConfiguredLocale(item.locale)) {
      reject(`"${item.locale}" is not one of the configured locales.`);
      continue;
    }
    const sourceEntry = findEntry(sourceCatalog, item.id);
    if (!sourceEntry) {
      reject("Unknown message ID; run i18n:extract first.");
      continue;
    }
    if (
      item.context !== undefined &&
      item.context !== null &&
      item.context !== (sourceEntry.msgctxt ?? null)
    ) {
      reject(`Context mismatch: expected ${sourceEntry.msgctxt ?? "none"}.`);
      continue;
    }

    const targetCatalog = catalogFor(item.locale);
    const targetEntry = findEntry(targetCatalog, item.id);
    if (!targetEntry) {
      reject("Message missing from the target catalog; run i18n:extract first.");
      continue;
    }

    const problems = validateIcuSubset(item.translation);
    if (problems.length > 0) {
      reject(`Invalid ICU: ${problems.join(" ")}`);
      continue;
    }

    const sourceSignature = icuSignature(sourceTextOf(sourceEntry));
    const translationSignature = icuSignature(item.translation);
    if (sourceSignature !== translationSignature) {
      reject(
        `Placeholder mismatch: source uses [${sourceSignature}], translation uses [${translationSignature}].`,
      );
      continue;
    }

    targetEntry.msgstr = item.translation;
    targetEntry.flags = targetEntry.flags.filter((flag) => flag !== "fuzzy");
    dirty.add(item.locale);
    result.accepted += 1;
  }

  for (const locale of dirty) {
    writeCatalog(locale, catalogFor(locale));
  }
  return result;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: i18n:apply <file>");
    process.exit(2);
  }

  let parsed: { items?: ApplyItem[] };
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as { items?: ApplyItem[] };
  } catch (error) {
    console.error(
      `Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }

  if (!Array.isArray(parsed.items)) {
    console.error('The apply file must contain an "items" array.');
    process.exit(2);
  }

  const result = applyTranslations(parsed.items);
  console.log(`Applied ${result.accepted} translations.`);
  for (const rejection of result.rejected) {
    console.error(`Rejected ${rejection.id} (${rejection.locale}): ${rejection.reason}`);
  }
  if (result.rejected.length > 0) process.exit(1);
}
