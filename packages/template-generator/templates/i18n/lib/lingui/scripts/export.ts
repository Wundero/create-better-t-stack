/**
 * `i18n:export` — normalizes every PO catalog into the shared normalized
 * catalog that JS tooling consumes (e.g. `i18n:sync-wxt`):
 *
 *   { sourceLocale, locales, messages: { "<id>": { source, context, translations } } }
 *
 * Message IDs are the library's own IDs (`generateMessageId(source, context)`
 * for generated-ID entries, the literal `msgid` for explicit-ID ones). Every
 * translation is validated as an ICU MessageFormat subset; a construct outside
 * the subset makes the script fail and names the message ID.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packageRoot, readCatalog, sourceLocale, targetLocales } from "./catalogs";
import { validateIcuSubset } from "./icu";
import { catalogId, sourceTextOf } from "./po";

export interface NormalizedMessage {
  source: string;
  context: string | null;
  translations: Record<string, string>;
}

export interface NormalizedCatalog {
  sourceLocale: string;
  locales: string[];
  messages: Record<string, NormalizedMessage>;
}

export interface ExportResult {
  ok: boolean;
  messages?: number;
  errors: string[];
}

export interface CatalogBuildResult {
  catalog: NormalizedCatalog;
  errors: string[];
}

export function buildCatalog(): CatalogBuildResult {
  const errors: string[] = [];
  const source = readCatalog(sourceLocale);
  const targets = targetLocales().map((locale) => ({ locale, catalog: readCatalog(locale) }));

  const messages: Record<string, NormalizedMessage> = {};

  for (const entry of source.entries) {
    if (entry.obsolete) continue;
    const id = catalogId(entry);
    const sourceText = sourceTextOf(entry);
    const translations: Record<string, string> = {};

    for (const problem of validateIcuSubset(sourceText)) {
      errors.push(`${id} (${sourceLocale}): ${problem}`);
    }
    translations[sourceLocale] = sourceText;

    for (const { locale, catalog } of targets) {
      const translated = catalog.entries.find(
        (candidate) => !candidate.obsolete && catalogId(candidate) === id,
      );
      const value = translated?.msgstr.trim() ? translated.msgstr : sourceText;
      for (const problem of validateIcuSubset(value)) {
        errors.push(`${id} (${locale}): ${problem}`);
      }
      translations[locale] = value;
    }

    messages[id] = {
      source: sourceText,
      context: entry.msgctxt ?? null,
      translations,
    };
  }

  return {
    catalog: { sourceLocale, locales: [sourceLocale, ...targetLocales()], messages },
    errors,
  };
}

export function exportCatalog(
  outFile = path.join(packageRoot, "dist", "catalog.json"),
): ExportResult {
  const { catalog, errors } = buildCatalog();
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(catalog, null, 2)}\n`);
  return { ok: true, messages: Object.keys(catalog.messages).length, errors: [] };
}

if (import.meta.main) {
  const result = exportCatalog();
  if (!result.ok) {
    console.error("i18n:export failed:");
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`Exported ${result.messages} messages to dist/catalog.json`);
}
