/**
 * `i18n:export`
 *
 * Writes the normalized catalog consumed by JS tooling (e.g. `i18n:sync-wxt`):
 *
 *   packages/i18n/dist/catalog.json
 *   {
 *     "sourceLocale": "en",
 *     "locales": ["en", "fr"],
 *     "messages": {
 *       "<id>": {
 *         "source": "…",
 *         "context": null,
 *         "translations": { "en": "<ICU>", "fr": "<ICU>" }
 *       }
 *     }
 *   }
 *
 * Message IDs are the Paraglide keys. Every message must stay inside the ICU
 * subset in `src/icu.ts`; anything else fails with the message ID instead of
 * writing a catalog outside the supported subset. A locale without a
 * translation fails the export unless `I18N_EXPORT_ALLOW_MISSING=1` is set,
 * which omits that locale from the message instead.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadCatalogs, resolveFromScript } from "../src/catalogs";
import { compareMessages, parseMessage } from "../src/icu";

interface NormalizedMessage {
  readonly source: string;
  readonly context: null;
  readonly translations: Record<string, string>;
}

interface NormalizedCatalog {
  readonly sourceLocale: string;
  readonly locales: readonly string[];
  readonly messages: Record<string, NormalizedMessage>;
}

export async function runExport(): Promise<number> {
  const packageRoot = resolveFromScript(import.meta.url);
  const allowMissing = process.env.I18N_EXPORT_ALLOW_MISSING === "1";

  try {
    const { sourceLocale, locales, source, catalogs } = await loadCatalogs(packageRoot);
    const messages: Record<string, NormalizedMessage> = {};
    const skipped: string[] = [];

    for (const id of Object.keys(source).sort()) {
      const sourceMessage = source[id] as string;
      const parsedSource = parseMessage(sourceMessage);
      if (!parsedSource.ok) {
        throw new Error(`cannot export "${id}": ${parsedSource.error}`);
      }

      const translations: Record<string, string> = {};
      for (const locale of locales) {
        const translated = catalogs.get(locale)?.[id];
        if (translated === undefined || translated === "") {
          if (locale === sourceLocale) {
            throw new Error(`cannot export "${id}": the source catalog has no message`);
          }
          if (!allowMissing) {
            throw new Error(
              `cannot export "${id}": no ${locale} translation yet (set I18N_EXPORT_ALLOW_MISSING=1 to skip it)`,
            );
          }
          skipped.push(`${id} (${locale})`);
          continue;
        }

        const comparison = compareMessages(sourceMessage, translated);
        if (!comparison.ok) {
          throw new Error(`cannot export "${id}" for ${locale}: ${comparison.error}`);
        }
        translations[locale] = translated;
      }

      messages[id] = { source: sourceMessage, context: null, translations };
    }

    const catalog: NormalizedCatalog = { sourceLocale, locales, messages };
    const outputDirectory = path.join(packageRoot, "dist");
    const outputPath = path.join(outputDirectory, "catalog.json");

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

    if (skipped.length > 0) {
      console.warn(`i18n:export skipped ${skipped.length} untranslated message(s):`);
      for (const entry of skipped) console.warn(`  - ${entry}`);
    }

    console.log(
      JSON.stringify(
        {
          library: "paraglide",
          output: path.relative(packageRoot, outputPath),
          sourceLocale,
          locales,
          messages: Object.keys(messages).length,
          skipped: skipped.length,
        },
        null,
        2,
      ),
    );

    return 0;
  } catch (error) {
    console.error(`i18n:export failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runExport();
}
