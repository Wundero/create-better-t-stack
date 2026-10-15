/**
 * Catalog file access for the `i18n:*` scripts.
 *
 * Catalogs live at `locales/<locale>/messages.po`; `i18n:compile` writes the
 * compiled `messages.ts` next to them. The locale list is the single source of
 * truth in `src/config.ts`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { locales, sourceLocale } from "../src/config";
import { createHeader, parsePoFile, serializePoFile, type PoCatalog } from "./po";

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export { locales, sourceLocale };

export function isConfiguredLocale(value: string): boolean {
  return locales.some((locale) => locale === value);
}

export function catalogPath(locale: string): string {
  return path.join(packageRoot, "locales", locale, "messages.po");
}

export function readCatalog(locale: string): PoCatalog {
  const file = catalogPath(locale);
  if (!existsSync(file)) {
    return { headers: createHeader(locale), entries: [] };
  }
  return parsePoFile(readFileSync(file, "utf8"));
}

export function writeCatalog(locale: string, catalog: PoCatalog): void {
  const file = catalogPath(locale);
  mkdirSync(path.dirname(file), { recursive: true });
  catalog.headers = { ...catalog.headers, Language: locale };
  writeFileSync(file, serializePoFile(catalog));
}

/** Target locales that receive translations: every configured locale except the source. */
export function targetLocales(): string[] {
  return locales.filter((locale) => locale !== sourceLocale);
}
