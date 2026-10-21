/**
 * `i18n:pending --locale <locale> | --all [--limit N]`
 *
 * Emits the uniform pending-items contract for the Paraglide catalogs:
 *
 *   {
 *     "library": "paraglide",
 *     "sourceLocale": "en",
 *     "items": [
 *       { id, locale, source, context, comments, references, placeholders, status }
 *     ]
 *   }
 *
 * An item is pending when the target catalog has no entry for the message ID
 * (`missing`) or an empty one (`empty`). The `i18n-translate` skill consumes
 * exactly this output and writes batches back through `i18n:apply`.
 */

import { loadCatalogs, resolveFromScript } from "../src/catalogs";
import { extractCatalogArguments, messageForms } from "../src/complex";

interface PendingItem {
  readonly id: string;
  readonly locale: string;
  readonly source: string;
  readonly context: null;
  readonly comments: readonly string[];
  readonly references: readonly string[];
  readonly placeholders: readonly string[];
  readonly status: "missing" | "empty";
}

interface PendingOptions {
  readonly locale?: string;
  readonly all: boolean;
  readonly limit?: number;
}

function parseArguments(argv: readonly string[]): PendingOptions {
  let locale: string | undefined;
  let all = false;
  let limit: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--all") {
      all = true;
    } else if (argument === "--locale") {
      locale = argv[index + 1];
      index += 1;
    } else if (argument === "--limit") {
      limit = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
    }
  }

  return { locale, all: all || locale === undefined, limit };
}

export async function runPending(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArguments(argv);
  if (options.limit !== undefined && (!Number.isFinite(options.limit) || options.limit < 0)) {
    console.error("`--limit` expects a non-negative number.");
    return 1;
  }

  const packageRoot = resolveFromScript(import.meta.url);
  const { sourceLocale, locales, source, catalogs } = await loadCatalogs(packageRoot);

  const targets = options.locale ? [options.locale] : [...locales];
  for (const target of targets) {
    if (!locales.includes(target)) {
      console.error(`"${target}" is not one of the configured locales: ${locales.join(", ")}.`);
      return 1;
    }
  }

  const items: PendingItem[] = [];
  for (const locale of targets) {
    if (locale === sourceLocale) continue;
    const catalog = catalogs.get(locale);
    if (!catalog) continue;

    for (const [id, sourceMessage] of Object.entries(source)) {
      const translation = catalog[id];
      const status = translation === undefined ? "missing" : translation === "" ? "empty" : null;
      if (!status) continue;

      items.push({
        id,
        locale,
        source: messageForms(sourceMessage).join(" || "),
        context: null,
        comments: [],
        references: [],
        placeholders: extractCatalogArguments(sourceMessage),
        status,
      });
    }
  }

  const limited = options.limit === undefined ? items : items.slice(0, options.limit);

  console.log(JSON.stringify({ library: "paraglide", sourceLocale, items: limited }, null, 2));

  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await runPending();
  } catch (error) {
    console.error(`i18n:pending failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
