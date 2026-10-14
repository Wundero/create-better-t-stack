/**
 * Catalog file access and the uniform script contract (design D8) for
 * i18next: `locales/<locale>/<namespace>.json`, natural-language keys with
 * separators disabled, plural suffixes (`_one`, `_other`) and `{{placeholders}}`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  exportCatalogEntries,
  interpolationNames,
  type CatalogEntry,
  type IcuMessage,
} from "./icu";

export const DEFAULT_NAMESPACE = "common";

export interface I18nScriptConfig {
  readonly locales: readonly string[];
  readonly sourceLocale: string;
}

export interface Catalog {
  readonly [id: string]: string;
}

export interface PendingItem {
  readonly id: string;
  readonly locale: string;
  readonly source: string;
  readonly context: string | null;
  readonly comments: readonly string[];
  readonly references: readonly string[];
  readonly placeholders: readonly string[];
  readonly status: "missing" | "pending";
}

export interface PendingOptions {
  readonly locale?: string;
  readonly all?: boolean;
  readonly limit?: number;
}

export interface ApplyItem {
  readonly id: string;
  readonly locale: string;
  readonly translation: string;
}

export interface ApplyRejection {
  readonly id: string;
  readonly locale: string;
  readonly reason: string;
}

export interface ApplyResult {
  readonly appliedCount: number;
  readonly rejected: ApplyRejection[];
}

export interface CheckProblem {
  readonly id: string;
  readonly locale: string;
  readonly reason: string;
}

export interface CheckResult {
  readonly checked: number;
  readonly problems: CheckProblem[];
}

/** Root of the generated `@<project>/i18n` package (this file lives in `scripts/lib`). */
export function packageRoot(): string {
  return dirname(dirname(import.meta.dir));
}

export function catalogPath(root: string, locale: string, namespace = DEFAULT_NAMESPACE): string {
  return join(root, "locales", locale, `${namespace}.json`);
}

export function readCatalog(root: string, locale: string, namespace = DEFAULT_NAMESPACE): Catalog {
  const path = catalogPath(root, locale, namespace);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Catalog;
}

export function writeCatalog(
  root: string,
  locale: string,
  catalog: Catalog,
  namespace = DEFAULT_NAMESPACE,
): void {
  const path = catalogPath(root, locale, namespace);
  mkdirSync(dirname(path), { recursive: true });
  const sorted: Catalog = {};
  for (const id of Object.keys(catalog).sort()) {
    const value = catalog[id];
    if (value !== undefined) sorted[id] = value;
  }
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

export function readCatalogSet(
  root: string,
  config: I18nScriptConfig,
  namespace = DEFAULT_NAMESPACE,
): Map<string, Catalog> {
  const catalogs = new Map<string, Catalog>();
  for (const locale of config.locales) {
    catalogs.set(locale, readCatalog(root, locale, namespace));
  }
  return catalogs;
}

function entriesOf(catalog: Catalog): CatalogEntry[] {
  return Object.entries(catalog).map(([id, value]) => ({ id, value }));
}

/** ICU messages for one locale, keyed by the i18next source-text id. */
export function icuMessagesById(catalog: Catalog): IcuMessage[] {
  return exportCatalogEntries(entriesOf(catalog));
}

function targetLocales(config: I18nScriptConfig, options: PendingOptions): string[] {
  if (options.locale) return [options.locale];
  if (options.all) return config.locales.filter((locale) => locale !== config.sourceLocale);
  throw new Error("i18n:pending needs --locale <locale> or --all");
}

/** Untranslated entries: missing from the target catalog or still equal to the source. */
export function collectPending(
  root: string,
  config: I18nScriptConfig,
  options: PendingOptions,
): PendingItem[] {
  const source = readCatalog(root, config.sourceLocale);
  const items: PendingItem[] = [];
  const limit = options.limit ?? Number.POSITIVE_INFINITY;

  for (const locale of targetLocales(config, options)) {
    const target = readCatalog(root, locale);
    for (const [id, sourceValue] of Object.entries(source)) {
      if (items.length >= limit) return items;
      const targetValue = target[id];
      if (targetValue === undefined) {
        items.push(pendingItem(id, locale, sourceValue, "missing"));
      } else if (targetValue === sourceValue) {
        items.push(pendingItem(id, locale, sourceValue, "pending"));
      }
    }
  }
  return items;
}

function pendingItem(
  id: string,
  locale: string,
  source: string,
  status: "missing" | "pending",
): PendingItem {
  return {
    id,
    locale,
    source,
    context: null,
    comments: [],
    references: [],
    placeholders: interpolationNames(source),
    status,
  };
}

/** Writes valid translations; rejects items whose placeholders differ from the source. */
export function applyTranslations(
  root: string,
  config: I18nScriptConfig,
  items: readonly ApplyItem[],
): ApplyResult {
  const source = readCatalog(root, config.sourceLocale);
  const catalogs = new Map<string, Catalog>();
  const rejected: ApplyRejection[] = [];
  let appliedCount = 0;

  for (const item of items) {
    const rejection = rejectApplyItem(item, source, config);
    if (rejection) {
      rejected.push(rejection);
      continue;
    }
    const catalog = catalogs.get(item.locale) ?? readCatalog(root, item.locale);
    catalogs.set(item.locale, { ...catalog, [item.id]: item.translation });
    appliedCount += 1;
  }

  for (const [locale, catalog] of catalogs) writeCatalog(root, locale, catalog);
  return { appliedCount, rejected };
}

function rejectApplyItem(
  item: ApplyItem,
  source: Catalog,
  config: I18nScriptConfig,
): ApplyRejection | null {
  if (!config.locales.includes(item.locale)) {
    return { id: item.id, locale: item.locale, reason: "locale is not configured" };
  }
  const sourceValue = source[item.id];
  if (sourceValue === undefined) {
    return { id: item.id, locale: item.locale, reason: "id is not in the source catalog" };
  }
  if (item.translation.trim().length === 0) {
    return { id: item.id, locale: item.locale, reason: "translation is empty" };
  }
  const sourceNames = interpolationNames(sourceValue).sort();
  const translationNames = interpolationNames(item.translation).sort();
  if (sourceNames.join(",") !== translationNames.join(",")) {
    const expected = sourceNames.join(", ") || "none";
    const received = translationNames.join(", ") || "none";
    return {
      id: item.id,
      locale: item.locale,
      reason: `placeholders differ: expected ${expected}, got ${received}`,
    };
  }
  return null;
}

/** Missing, untranslated and placeholder-invalid entries per configured locale. */
export function checkCatalogs(
  root: string,
  config: I18nScriptConfig,
  options: { readonly allowMissing: boolean },
): CheckResult {
  const source = readCatalog(root, config.sourceLocale);
  const problems: CheckProblem[] = [];
  let checked = 0;

  for (const locale of config.locales) {
    if (locale === config.sourceLocale) continue;
    const target = readCatalog(root, locale);
    for (const [id, sourceValue] of Object.entries(source)) {
      checked += 1;
      const targetValue = target[id];
      if (targetValue === undefined) {
        if (!options.allowMissing) problems.push({ id, locale, reason: "missing" });
        continue;
      }
      if (targetValue === sourceValue) {
        if (!options.allowMissing) problems.push({ id, locale, reason: "untranslated" });
        continue;
      }
      const sourceNames = interpolationNames(sourceValue).sort().join(",");
      const targetNames = interpolationNames(targetValue).sort().join(",");
      if (sourceNames !== targetNames) {
        problems.push({ id, locale, reason: "placeholders differ from the source" });
      }
    }
  }
  return { checked, problems };
}
