/**
 * `i18n:apply <file>`
 *
 * Writes translated messages into the catalogs after validating them against
 * the source catalog:
 *
 *   {
 *     "items": [
 *       { "id": "i18n_demo_heading", "locale": "fr", "translation": "..." }
 *     ]
 *   }
 *
 * Each item must reference an existing source message ID and keep the source's
 * placeholders and ICU argument sets. Invalid items are rejected individually;
 * valid items are still written. The process exits non-zero when anything was
 * rejected.
 */

import {
  catalogPath,
  loadCatalogs,
  readCatalog,
  readJsonFile,
  resolveFromScript,
  writeCatalog,
} from "../src/catalogs";
import { compareMessages } from "../src/icu";

interface ApplyItem {
  readonly id: string;
  readonly locale: string;
  readonly translation: string;
}

interface RejectedItem {
  readonly id: string;
  readonly locale: string;
  readonly reason: string;
}

export async function runApply(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const file = argv[0];
  if (!file) {
    console.error("Usage: i18n:apply <file>");
    return 1;
  }

  let payload: { items?: ApplyItem[] };
  try {
    payload = (await readJsonFile(file)) as { items?: ApplyItem[] };
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const rawItems = payload.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    console.error("The apply file must contain a non-empty `items` array.");
    return 1;
  }

  const packageRoot = resolveFromScript(import.meta.url);
  const { sourceLocale, locales, source } = await loadCatalogs(packageRoot);

  const pending = new Map<string, Map<string, string>>();
  const rejected: RejectedItem[] = [];
  let applied = 0;

  for (const item of rawItems) {
    if (!item || !item.id || !item.locale || !item.translation) {
      rejected.push({
        id: item?.id ?? "?",
        locale: item?.locale ?? "?",
        reason: "items need non-empty id, locale and translation strings",
      });
      continue;
    }

    if (!locales.includes(item.locale)) {
      rejected.push({
        id: item.id,
        locale: item.locale,
        reason: `"${item.locale}" is not one of the configured locales`,
      });
      continue;
    }
    if (item.locale === sourceLocale) {
      rejected.push({
        id: item.id,
        locale: item.locale,
        reason: "the source locale is edited in the catalogs directly",
      });
      continue;
    }

    const sourceMessage = source[item.id];
    if (sourceMessage === undefined) {
      rejected.push({
        id: item.id,
        locale: item.locale,
        reason: "the message ID is not in the source catalog",
      });
      continue;
    }

    const comparison = compareMessages(sourceMessage, item.translation);
    if (!comparison.ok) {
      rejected.push({ id: item.id, locale: item.locale, reason: comparison.error });
      continue;
    }

    let localeUpdates = pending.get(item.locale);
    if (!localeUpdates) {
      localeUpdates = new Map();
      pending.set(item.locale, localeUpdates);
    }
    localeUpdates.set(item.id, item.translation);
    applied += 1;
  }

  for (const [locale, updates] of pending) {
    const filePath = catalogPath(packageRoot, locale);
    const catalog = await readCatalog(filePath);
    for (const [id, translation] of updates) {
      catalog[id] = translation;
    }
    await writeCatalog(filePath, catalog);
  }

  console.log(JSON.stringify({ library: "paraglide", applied, rejected }, null, 2));
  return rejected.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await runApply();
  } catch (error) {
    console.error(`i18n:apply failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
