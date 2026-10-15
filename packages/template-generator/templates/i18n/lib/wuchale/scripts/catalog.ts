/**
 * Shared helpers for the wuchale uniform scripts
 * (`i18n:extract | compile | pending | apply | check | export`).
 *
 * Everything here is pure or filesystem-only: the CLI entrypoints add argv
 * handling and JSON output. Catalogs are the per-adapter `.po` files wuchale
 * writes into `packages/i18n/locales`.
 */

import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isUntranslated, parsePo, serializePo, type PoCatalog, type PoItem } from "./po";

export const WUCHALE_LIBRARY = "wuchale";

export interface CatalogSource {
  readonly adapter: string;
  readonly locale: string;
  readonly path: string;
}

export interface CatalogRead {
  readonly source: CatalogSource;
  readonly catalog: PoCatalog;
}

export interface PendingItem {
  readonly id: string;
  readonly locale: string;
  readonly source: string;
  readonly context: string | null;
  readonly comments: string[];
  readonly references: string[];
  readonly placeholders: string[];
  readonly status: "pending" | "obsolete";
}

export interface PendingReport {
  readonly library: typeof WUCHALE_LIBRARY;
  readonly sourceLocale: string;
  readonly items: PendingItem[];
}

export interface NormalizedMessage {
  readonly source: string;
  readonly context: string | null;
  readonly translations: Record<string, string>;
}

export interface NormalizedCatalog {
  readonly sourceLocale: string;
  readonly locales: string[];
  readonly messages: Record<string, NormalizedMessage>;
}

export type IcuResult =
  | { readonly isOk: true; readonly message: string }
  | { readonly isOk: false; readonly error: string };

export type ExportResult =
  | { readonly isOk: true; readonly catalog: NormalizedCatalog }
  | { readonly isOk: false; readonly errors: string[] };

/** `packages/i18n` root, resolved from a script in `packages/i18n/scripts`. */
export function resolvePackageRoot(importMetaUrl: string): string {
  return fileURLToPath(new URL("..", importMetaUrl));
}

export function catalogsDir(packageRoot: string): string {
  return join(packageRoot, "locales");
}

export function parseCatalogFileName(fileName: string): { adapter: string; locale: string } | null {
  const base = fileName.endsWith(".po") ? fileName.slice(0, -3) : null;
  if (base === null) return null;
  const separator = base.lastIndexOf(".");
  if (separator <= 0) return null;
  const adapter = base.slice(0, separator);
  const locale = base.slice(separator + 1);
  return locale.length > 0 ? { adapter, locale } : null;
}

export async function listCatalogSources(packageRoot: string): Promise<CatalogSource[]> {
  const dir = catalogsDir(packageRoot);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const sources: CatalogSource[] = [];
  for (const entry of entries.sort()) {
    const parsed = parseCatalogFileName(entry);
    if (!parsed) continue;
    sources.push({ adapter: parsed.adapter, locale: parsed.locale, path: join(dir, entry) });
  }
  return sources;
}

export async function readCatalogs(packageRoot: string): Promise<CatalogRead[]> {
  const catalogs: CatalogRead[] = [];
  for (const source of await listCatalogSources(packageRoot)) {
    const content = await readFile(source.path, "utf8");
    catalogs.push({ source, catalog: parsePo(content) });
  }
  return catalogs;
}

export async function writeCatalogFile(path: string, catalog: PoCatalog): Promise<void> {
  await writeFile(path, serializePo(catalog), "utf8");
}

export const PLURAL_ORDER: readonly Intl.LDMLPluralRule[] = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
];

/** CLDR plural categories for a locale, in wuchale's candidate order. */
export function pluralCategories(locale: string): Intl.LDMLPluralRule[] {
  const categories = [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories];
  categories.sort((first, second) => PLURAL_ORDER.indexOf(first) - PLURAL_ORDER.indexOf(second));
  return categories;
}

const PLACEHOLDER = /\{(\d+)\}/g;

export function messagePlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  return [...found].sort((first, second) => Number(first) - Number(second));
}

/** The source forms of an item: `[msgid]` or `[msgid, msgid_plural]`. */
export function sourceForms(item: PoItem): string[] {
  return item.pluralId === null ? [item.id] : [item.id, item.pluralId];
}

/**
 * Validates that every translated form keeps exactly the source placeholders.
 * Returns an error message for the first mismatch, or `null` when the
 * translation is well formed.
 */
export function validatePlaceholders(item: PoItem, forms: readonly string[]): string | null {
  const expected = sourceForms(item);
  if (forms.length === 0) return `"${item.id}" has no translation forms`;
  for (const [index, form] of forms.entries()) {
    const source = expected[index % expected.length] ?? expected[0] ?? "";
    const actualPlaceholders = messagePlaceholders(form);
    const expectedPlaceholders = messagePlaceholders(source);
    const missing = expectedPlaceholders.filter((value) => !actualPlaceholders.includes(value));
    const extra = actualPlaceholders.filter((value) => !expectedPlaceholders.includes(value));
    if (missing.length > 0 || extra.length > 0) {
      const details = [
        missing.length > 0 ? `missing {${missing.join("}, {")}}` : null,
        extra.length > 0 ? `unexpected {${extra.join("}, {")}}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `"${item.id}" form ${index} placeholder mismatch: ${details}`;
    }
  }
  return null;
}

/** A stable id for the normalized export: context-qualified source text. */
export function normalizeMessageId(item: PoItem): string {
  return item.context === null ? item.id : `${item.context}|${item.id}`;
}

function balancedBraces(text: string): string | null {
  const withoutPlaceholders = text.replace(PLACEHOLDER, "");
  let depth = 0;
  for (const char of withoutPlaceholders) {
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth < 0) return "unbalanced brace";
    }
  }
  return depth === 0 ? null : "unbalanced brace";
}

/**
 * Converts a wuchale catalog item to the ICU subset used by `i18n:export`:
 * positional arguments, `plural` with `#`, `select` and nesting. Wuchale
 * already writes positional `{n}` placeholders, so the conversion keeps them
 * as ICU arguments; a plural item becomes one `{count, plural, ...}` message
 * whose categories follow the locale's CLDR order.
 */
export function toIcuMessage(item: PoItem, forms: readonly string[], locale: string): IcuResult {
  if (item.pluralId === null) {
    const message = forms[0] ?? item.id;
    const error = balancedBraces(message);
    return error === null ? { isOk: true, message } : { isOk: false, error };
  }

  const categories = pluralCategories(locale);
  const parts: string[] = [];
  for (const [index, category] of categories.entries()) {
    const form = forms[index] ?? forms[forms.length - 1] ?? item.id;
    const error = balancedBraces(form);
    if (error !== null) return { isOk: false, error };
    parts.push(`${category} {${form}}`);
  }

  return { isOk: true, message: `{count, plural, ${parts.join(" ")}}` };
}

/** Pending items for one locale, or for every non-source locale. */
export function collectPendingItems(
  catalogs: readonly CatalogRead[],
  sourceLocale: string,
  targetLocale: string | null,
): PendingItem[] {
  const items: PendingItem[] = [];
  for (const read of catalogs) {
    if (read.source.locale === sourceLocale) continue;
    if (targetLocale !== null && read.source.locale !== targetLocale) continue;
    for (const item of read.catalog.items) {
      if (item.id.length === 0 && item.pluralId === null) continue;
      if (!isUntranslated(item.translations) && !item.obsolete) continue;
      items.push({
        id: normalizeMessageId(item),
        locale: read.source.locale,
        source: sourceForms(item).join(" || "),
        context: item.context,
        comments: [...item.comments, ...item.extracted],
        references: [...item.references],
        placeholders: messagePlaceholders(sourceForms(item).join(" ")),
        status: item.obsolete ? "obsolete" : "pending",
      });
    }
  }
  return items;
}

export interface ApplyPayloadItem {
  readonly id: string;
  readonly locale: string;
  readonly context?: string | null;
  readonly translation?: string;
  readonly translations?: string[];
}

export interface ApplyOutcome {
  readonly applied: number;
  readonly rejected: { id: string; locale: string; error: string }[];
}

export function findItem(
  catalog: PoCatalog,
  id: string,
  context: string | null | undefined,
): PoItem | undefined {
  return catalog.items.find(
    (item) =>
      normalizeMessageId(item) === id && (context === undefined || item.context === context),
  );
}

/**
 * Applies one validated translation set to a parsed catalog. Validation must
 * run first; this only mutates the in-memory item.
 */
export function setTranslation(item: PoItem, forms: readonly string[]): void {
  item.translations = [...forms];
  item.obsolete = false;
}

export interface NormalizeOptions {
  readonly locales: readonly string[];
  readonly sourceLocale: string;
}

/**
 * Builds the normalized catalog (`dist/catalog.json`) from every parsed
 * per-adapter catalog.
 * Fails with the offending message id when a message is outside the ICU
 * subset.
 */
export function buildNormalizedCatalog(
  catalogs: readonly CatalogRead[],
  options: NormalizeOptions,
): ExportResult {
  const errors: string[] = [];
  const messages = new Map<
    string,
    { source: string; context: string | null; translations: Map<string, string> }
  >();
  const sourceByKey = new Map<string, PoItem>();

  for (const read of catalogs) {
    for (const item of read.catalog.items) {
      if (item.id.length === 0 && item.pluralId === null) continue;
      const id = normalizeMessageId(item);
      const existingSource = sourceByKey.get(id);
      if (existingSource === undefined) {
        sourceByKey.set(id, item);
      } else if (sourceForms(existingSource).join(" ") !== sourceForms(item).join(" ")) {
        errors.push(`"${id}" has conflicting source text across adapters`);
        continue;
      }

      const entry = messages.get(id) ?? {
        source: sourceForms(item).join(" || "),
        context: item.context,
        translations: new Map<string, string>(),
      };
      messages.set(id, entry);

      const forms = isUntranslated(item.translations) ? sourceForms(item) : item.translations;
      const locale = read.source.locale;
      const converted = toIcuMessage(item, forms, locale);
      if (!converted.isOk) {
        errors.push(`"${id}" (${locale}): ${converted.error}`);
        continue;
      }
      if (!entry.translations.has(locale)) {
        entry.translations.set(locale, converted.message);
      }
    }
  }

  if (errors.length > 0) return { isOk: false, errors };

  const normalizedMessages: Record<string, NormalizedMessage> = {};
  for (const [id, entry] of messages) {
    const translations: Record<string, string> = {};
    for (const locale of options.locales) {
      const message =
        entry.translations.get(locale) ?? entry.translations.get(options.sourceLocale);
      if (message !== undefined) translations[locale] = message;
    }
    normalizedMessages[id] = { source: entry.source, context: entry.context, translations };
  }

  return {
    isOk: true,
    catalog: {
      sourceLocale: options.sourceLocale,
      locales: [...options.locales],
      messages: normalizedMessages,
    },
  };
}

/**
 * Resolves `wuchale/dist/cli/index.js` from this package's dependencies. The
 * published bin has a Node shebang, and Node cannot import a `.ts` config
 * without a loader — the scripts always run the CLI with the Bun binary that
 * is already running them.
 */
function resolveWuchaleCli(): string | null {
  try {
    const entry = fileURLToPath(import.meta.resolve("wuchale"));
    return join(dirname(entry), "cli", "index.js");
  } catch {
    return null;
  }
}

/**
 * Runs the wuchale CLI from `packages/i18n`. `import.meta.resolve` finds the
 * locally installed `wuchale`, so no registry lookup or PATH shim is involved.
 */
export function runWuchaleCli(packageRoot: string, args: readonly string[]): number {
  const cli = resolveWuchaleCli();
  if (cli === null) {
    console.error("wuchale is not installed. Run your package manager install first.");
    return 1;
  }

  const result = spawnSync(process.execPath, [cli, "--config", "wuchale.config.mjs", ...args], {
    cwd: packageRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(`Failed to run the wuchale CLI: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

export async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}
