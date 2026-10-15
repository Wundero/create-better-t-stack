/**
 * `i18n:check`
 *
 * Fails when a catalog is missing, invalid, or has untranslated messages:
 *
 *   - every message must stay inside the ICU subset in `src/icu.ts`;
 *   - every translation must keep the source placeholders and argument sets;
 *   - every source message needs an entry in each target catalog unless
 *     `I18N_CHECK_ALLOW_MISSING=1` relaxes missing entries for development.
 *
 * Prints a JSON report and exits 1 when the check fails.
 */

import { access } from "node:fs/promises";

import { catalogPath, loadSettings, readCatalog, resolveFromScript } from "../src/catalogs";
import { compareMessages, parseMessage } from "../src/icu";

interface Problem {
  readonly locale: string;
  readonly id: string;
  readonly kind: "catalog" | "missing" | "invalid" | "unknown";
  readonly reason: string;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runCheck(): Promise<number> {
  const packageRoot = resolveFromScript(import.meta.url);
  const allowMissing = process.env.I18N_CHECK_ALLOW_MISSING === "1";
  const settings = await loadSettings(packageRoot);
  const problems: Problem[] = [];

  const catalogs = new Map<string, Record<string, string>>();
  for (const locale of settings.locales) {
    const filePath = catalogPath(packageRoot, locale);
    if (!(await exists(filePath))) {
      problems.push({
        locale,
        id: "*",
        kind: "catalog",
        reason: `messages/${locale}.json is missing; run \`i18n:extract\``,
      });
      continue;
    }
    try {
      catalogs.set(locale, await readCatalog(filePath));
    } catch (error) {
      problems.push({
        locale,
        id: "*",
        kind: "catalog",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const source = catalogs.get(settings.baseLocale) ?? {};
  for (const [id, message] of Object.entries(source)) {
    const parsed = parseMessage(message);
    if (!parsed.ok) {
      problems.push({ locale: settings.baseLocale, id, kind: "invalid", reason: parsed.error });
    }
  }

  for (const locale of settings.locales) {
    if (locale === settings.baseLocale) continue;
    const catalog = catalogs.get(locale);
    if (!catalog) continue;

    for (const [id, sourceMessage] of Object.entries(source)) {
      const translation = catalog[id];
      if (translation === undefined || translation === "") {
        problems.push({
          locale,
          id,
          kind: "missing",
          reason: translation === undefined ? "no translation yet" : "translation is empty",
        });
        continue;
      }

      const comparison = compareMessages(sourceMessage, translation);
      if (!comparison.ok) {
        problems.push({ locale, id, kind: "invalid", reason: comparison.error });
      }
    }

    for (const id of Object.keys(catalog)) {
      if (source[id] === undefined) {
        problems.push({
          locale,
          id,
          kind: "unknown",
          reason: "the message ID is not in the source catalog",
        });
      }
    }
  }

  const blocking = problems.filter((problem) => problem.kind !== "missing" || !allowMissing);

  console.log(
    JSON.stringify(
      {
        library: "paraglide",
        ok: blocking.length === 0,
        allowMissing,
        problems,
      },
      null,
      2,
    ),
  );

  return blocking.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await runCheck();
  } catch (error) {
    console.error(`i18n:check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
