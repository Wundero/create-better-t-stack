import { isConfiguredLocale, readCatalog, sourceLocale, targetLocales } from "./catalogs";
import { icuPlaceholders } from "./icu";
/**
 * `i18n:pending [--locale <l> | --all] [--limit N]` — emits the library-independent
 * JSON contract the `i18n-translate` skill consumes:
 *
 *   { library, sourceLocale, items: [{ id, locale, source, context, comments,
 *     references, placeholders, status }] }
 *
 * Only messages that still need a translation (missing or fuzzy) are listed.
 */
import type { PoEntry } from "./po";
import { catalogId, sourceTextOf } from "./po";

export type PendingStatus = "missing" | "fuzzy";

export interface PendingItem {
  id: string;
  locale: string;
  source: string;
  context: string | null;
  comments: string[];
  references: string[];
  placeholders: string[];
  status: PendingStatus;
}

export interface PendingContract {
  library: "lingui";
  sourceLocale: string;
  items: PendingItem[];
}

function statusOf(entry: PoEntry): PendingStatus | undefined {
  if (entry.flags.includes("fuzzy")) return "fuzzy";
  if (entry.msgstr.trim() === "") return "missing";
  return undefined;
}

export function collectPending(localeList: readonly string[], limit?: number): PendingContract {
  const sourceCatalog = readCatalog(sourceLocale);
  const items: PendingItem[] = [];

  for (const entry of sourceCatalog.entries) {
    if (entry.obsolete) continue;
    const id = catalogId(entry);
    const source = sourceTextOf(entry);
    for (const locale of localeList) {
      const target = readCatalog(locale).entries.find(
        (candidate) => !candidate.obsolete && catalogId(candidate) === id,
      );
      const status = target ? statusOf(target) : "missing";
      if (!status) continue;
      items.push({
        id,
        locale,
        source,
        context: entry.msgctxt ?? null,
        comments: entry.comments,
        references: entry.references,
        placeholders: icuPlaceholders(source),
        status,
      });
      if (limit !== undefined && items.length >= limit)
        return { library: "lingui", sourceLocale, items };
    }
  }

  return { library: "lingui", sourceLocale, items };
}

interface PendingOptions {
  locales: string[];
  limit?: number;
  error?: string;
}

export function parsePendingArgs(argv: readonly string[]): PendingOptions {
  const locales: string[] = [];
  let all = false;
  let limit: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--all") {
      all = true;
      continue;
    }
    if (argument === "--locale") {
      const value = argv[index + 1];
      index += 1;
      if (!value) return { locales, error: "--locale requires a value." };
      locales.push(value);
      continue;
    }
    if (argument === "--limit") {
      const value = Number(argv[index + 1]);
      index += 1;
      if (!Number.isInteger(value) || value <= 0) {
        return { locales, error: "--limit requires a positive integer." };
      }
      limit = value;
      continue;
    }
    return { locales, error: `Unknown argument: ${argument}` };
  }

  if (all) return { locales: targetLocales(), limit };
  if (locales.length === 0) return { locales, limit, error: "Pass --locale <locale> or --all." };

  for (const locale of locales) {
    if (!isConfiguredLocale(locale)) {
      return { locales, limit, error: `"${locale}" is not one of the configured locales.` };
    }
  }
  return { locales: locales.filter((locale) => locale !== sourceLocale), limit };
}

if (import.meta.main) {
  const options = parsePendingArgs(process.argv.slice(2));
  if (options.error) {
    console.error(options.error);
    process.exit(2);
  }
  console.log(JSON.stringify(collectPending(options.locales, options.limit), null, 2));
}
