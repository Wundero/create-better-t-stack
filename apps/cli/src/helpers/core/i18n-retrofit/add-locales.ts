import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { I18nOptionsSchema, type I18nLibrary, type I18nOptions } from "../../../types";
import { CLIError } from "../../../utils/errors";
import type { RetrofitEdit, RetrofitPlan, RetrofitSkipped } from "./types";

const CONFIG_PATH = "packages/i18n/src/config.ts";
const LOCALES_BLOCK = /export const locales = \[[\s\S]*?\] as const;/;

function poHeader(locale: string): string {
  return [
    'msgid ""',
    'msgstr ""',
    '"Content-Type: text/plain; charset=utf-8\\n"',
    `"Language: ${locale}\\n"`,
    "",
  ].join("\n");
}

function catalogFiles(library: I18nLibrary, locale: string): { path: string; content: string }[] {
  switch (library) {
    case "lingui":
      return [{ path: `packages/i18n/locales/${locale}/messages.po`, content: poHeader(locale) }];
    case "paraglide":
      return [{ path: `packages/i18n/messages/${locale}.json`, content: "{}\n" }];
    case "i18next":
      return [{ path: `packages/i18n/locales/${locale}/common.json`, content: "{}\n" }];
    case "wuchale":
      return [{ path: `packages/i18n/locales/${locale}.po`, content: poHeader(locale) }];
  }
}

function renderLocalesBlock(locales: readonly string[]): string {
  return `export const locales = [\n${locales.map((locale) => `  "${locale}",`).join("\n")}\n] as const;`;
}

export interface AddLocalesPlanInput {
  projectDir: string;
  library: I18nLibrary;
  existingOptions: I18nOptions;
  requestedOptions: I18nOptions;
}

/**
 * Add Path "add-locales" mode (design D9): no library change. Creates an empty
 * catalog per new locale and extends the locale list in `packages/i18n`.
 * Removing a locale is not supported through `add`.
 */
export async function buildAddLocalesPlan(
  input: AddLocalesPlanInput,
): Promise<Result<RetrofitPlan, CLIError>> {
  const { library, existingOptions, requestedOptions } = input;

  const removed = existingOptions.locales.filter(
    (locale) => !requestedOptions.locales.includes(locale),
  );
  if (removed.length > 0) {
    return Result.err(
      new CLIError({
        message: `Removing locales (${removed.join(", ")}) is not supported through \`bts add\`. Edit bts.jsonc and packages/i18n/src/config.ts instead.`,
      }),
    );
  }

  const options = I18nOptionsSchema.parse(requestedOptions);
  const newLocales = options.locales.filter((locale) => !existingOptions.locales.includes(locale));
  if (newLocales.length === 0) {
    return Result.ok({ mode: "noop", library, options, edits: [], skipped: [] });
  }

  const configFullPath = path.join(input.projectDir, CONFIG_PATH);
  const configContent = (await fs.pathExists(configFullPath))
    ? await fs.readFile(configFullPath, "utf-8")
    : undefined;

  const edits: RetrofitEdit[] = [];
  const skipped: RetrofitSkipped[] = [];

  if (configContent === undefined || !LOCALES_BLOCK.test(configContent)) {
    edits.push({
      kind: "manual",
      path: CONFIG_PATH,
      description: `Add ${newLocales.join(", ")} to the \`locales\` array in ${CONFIG_PATH}.`,
      snippet: renderLocalesBlock(options.locales),
    });
  } else {
    edits.push({
      kind: "config-edit",
      path: CONFIG_PATH,
      description: `Add ${newLocales.join(", ")} to ${CONFIG_PATH}`,
      content: configContent.replace(LOCALES_BLOCK, renderLocalesBlock(options.locales)),
    });
  }

  for (const locale of newLocales) {
    for (const file of catalogFiles(library, locale)) {
      const fullPath = path.join(input.projectDir, file.path);
      if (await fs.pathExists(fullPath)) {
        skipped.push({ path: file.path, reason: "Catalog already exists" });
        continue;
      }
      edits.push({
        kind: "create",
        path: file.path,
        description: `Create the ${locale} catalog`,
        content: file.content,
      });
    }
  }

  return Result.ok({ mode: "add-locales", library, options, edits, skipped });
}
