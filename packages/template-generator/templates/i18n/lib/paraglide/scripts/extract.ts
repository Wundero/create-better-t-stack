/**
 * `i18n:extract`
 *
 * Paraglide message IDs are authored, not extracted: every key in
 * `messages/{sourceLocale}.json` is the message ID. This script therefore
 * never rewrites the source catalog. It keeps the uniform script contract:
 *
 *   1. validates `project.inlang/settings.json`;
 *   2. creates an empty `messages/{locale}.json` for every configured locale
 *      that does not have one yet (add-locales relies on this);
 *   3. prints a JSON summary.
 */

import { access, writeFile } from "node:fs/promises";

import { catalogPath, loadSettings, resolveFromScript } from "../src/catalogs";

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runExtract(): Promise<number> {
  const packageRoot = resolveFromScript(import.meta.url);
  const settings = await loadSettings(packageRoot);

  const created: string[] = [];
  const existing: string[] = [];

  for (const locale of settings.locales) {
    const filePath = catalogPath(packageRoot, locale);
    if (await exists(filePath)) {
      existing.push(locale);
      continue;
    }

    await writeFile(
      filePath,
      `${JSON.stringify({ $schema: "https://inlang.com/schema/inlang-message-format" }, null, 2)}\n`,
      "utf8",
    );
    created.push(locale);
  }

  console.log(
    JSON.stringify(
      {
        library: "paraglide",
        extracted: 0,
        note: "Message IDs are authored in messages/*.json; there is nothing to extract.",
        created,
        existing,
      },
      null,
      2,
    ),
  );

  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await runExtract();
  } catch (error) {
    console.error(`i18n:extract failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
