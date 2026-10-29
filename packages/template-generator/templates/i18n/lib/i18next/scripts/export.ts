/**
 * `i18n:export` — writes the normalized catalog (`dist/catalog.json`) consumed
 * by JS tooling (e.g. `i18n:sync-wxt`): one message per source-text id with
 * every locale converted to the ICU subset.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { locales, sourceLocale } from "../src/config";
import { icuMessagesById, packageRoot, readCatalogSet } from "./lib/catalogs";

export interface NormalizedMessage {
  /** The source-locale ICU message. */
  readonly source: string;
  readonly context: null;
  readonly translations: Readonly<Record<string, string>>;
}

export interface NormalizedCatalog {
  readonly sourceLocale: string;
  readonly locales: readonly string[];
  readonly messages: Readonly<Record<string, NormalizedMessage>>;
}

export function buildNormalizedCatalog(root: string = packageRoot()): NormalizedCatalog {
  const catalogs = readCatalogSet(root, { locales, sourceLocale });
  const icuByLocale = new Map<string, Map<string, string>>();
  for (const locale of locales) {
    const messages = new Map<string, string>();
    for (const message of icuMessagesById(catalogs.get(locale) ?? {})) {
      messages.set(message.id, message.icu);
    }
    icuByLocale.set(locale, messages);
  }

  const sourceMessages = icuMessagesById(catalogs.get(sourceLocale) ?? {});
  const messages: Record<string, NormalizedMessage> = {};
  for (const sourceMessage of sourceMessages) {
    const translations: Record<string, string> = {};
    for (const locale of locales) {
      translations[locale] = icuByLocale.get(locale)?.get(sourceMessage.id) ?? sourceMessage.icu;
    }
    messages[sourceMessage.id] = { source: sourceMessage.icu, context: null, translations };
  }

  return { sourceLocale, locales, messages };
}

export function runExport(root: string = packageRoot()): string {
  const output = join(root, "dist", "catalog.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(buildNormalizedCatalog(root), null, 2)}\n`);
  return output;
}

if (import.meta.main) {
  console.log(`i18n:export wrote ${runExport()}`);
}
