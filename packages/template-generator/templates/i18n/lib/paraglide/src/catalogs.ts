/**
 * Catalog helpers shared by the `i18n:*` scripts.
 *
 * Catalogs are the inlang message format: `messages/{locale}.json`, one flat
 * object per locale. `project.inlang/settings.json` is the source of truth for
 * the locale list.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ProjectSettings {
  readonly baseLocale: string;
  readonly locales: readonly string[];
}

export type Catalog = Record<string, string>;

export interface LoadedCatalogs {
  readonly settings: ProjectSettings;
  readonly sourceLocale: string;
  readonly locales: readonly string[];
  /** Source-locale messages, keyed by message ID. */
  readonly source: Catalog;
  /** Every locale, including the source locale, keyed by message ID. */
  readonly catalogs: ReadonlyMap<string, Catalog>;
}

interface ParsedSettings {
  baseLocale?: string;
  locales?: string[];
}

/** Resolves a path relative to the package root from a `scripts/*.ts` URL. */
export function resolveFromScript(scriptUrl: string, ...segments: string[]): string {
  const scriptDirectory = path.dirname(fileURLToPath(scriptUrl));
  return path.join(scriptDirectory, "..", ...segments);
}

export function settingsPath(packageRoot: string): string {
  return path.join(packageRoot, "project.inlang", "settings.json");
}

export function messagesDirectory(packageRoot: string): string {
  return path.join(packageRoot, "messages");
}

export function catalogPath(packageRoot: string, locale: string): string {
  return path.join(messagesDirectory(packageRoot), `${locale}.json`);
}

export async function readJsonFile(filePath: string): Promise<JsonValue> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Missing file: ${filePath}`);
  }

  try {
    return JSON.parse(content) as JsonValue;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${filePath}: ${reason}`);
  }
}

export async function loadSettings(packageRoot: string): Promise<ProjectSettings> {
  const raw = await readJsonFile(settingsPath(packageRoot));
  const settings = raw as ParsedSettings;

  if (settings.baseLocale === undefined || !Array.isArray(settings.locales)) {
    throw new Error(`${settingsPath(packageRoot)} must define "baseLocale" and "locales"`);
  }
  if (!settings.locales.includes(settings.baseLocale)) {
    throw new Error(`"${settings.baseLocale}" must be one of the configured locales`);
  }

  return { baseLocale: settings.baseLocale, locales: settings.locales };
}

/** Reads one catalog. Ignores the `$schema` hint inlang writes. */
export async function readCatalog(filePath: string): Promise<Catalog> {
  const raw = await readJsonFile(filePath);
  if (Array.isArray(raw)) {
    throw new Error(`${filePath} must be a JSON object of message ID → message`);
  }

  const parsed = raw as Record<string, string>;
  const catalog: Catalog = {};
  for (const [id, message] of Object.entries(parsed)) {
    if (id === "$schema") continue;
    catalog[id] = message;
  }
  return catalog;
}

/** Writes a catalog with sorted, stable IDs and a `$schema` hint. */
export async function writeCatalog(filePath: string, catalog: Catalog): Promise<void> {
  const sorted: Catalog = { $schema: "https://inlang.com/schema/inlang-message-format" };
  for (const id of Object.keys(catalog).sort()) {
    sorted[id] = catalog[id] as string;
  }
  await writeFile(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

export async function loadCatalogs(packageRoot: string): Promise<LoadedCatalogs> {
  const settings = await loadSettings(packageRoot);
  const catalogs = new Map<string, Catalog>();
  const missing: string[] = [];

  for (const locale of settings.locales) {
    const filePath = catalogPath(packageRoot, locale);
    try {
      catalogs.set(locale, await readCatalog(filePath));
    } catch {
      missing.push(locale);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing catalog(s) for ${missing.join(", ")}. Run \`i18n:extract\` to create them.`,
    );
  }

  const source = catalogs.get(settings.baseLocale);
  if (!source) {
    throw new Error(`Missing catalog for the source locale "${settings.baseLocale}".`);
  }

  return {
    settings,
    sourceLocale: settings.baseLocale,
    locales: settings.locales,
    source,
    catalogs,
  };
}
