/**
 * Shared helpers for the wuchale uniform scripts
 * (`i18n:extract | compile | pending | apply | check`).
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

/** A stable context-qualified message id. */
export function normalizeMessageId(item: PoItem): string {
  return item.context === null ? item.id : `${item.context}|${item.id}`;
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
