import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import {
  getI18nIntegrations,
  type I18nIntegrationId,
  type I18nLibrary,
  type I18nOptions,
  type ProjectConfig,
} from "../../../types";
import { CLIError } from "../../../utils/errors";
import { toI18nConfigInput } from "../../../utils/i18n-cli";
import type { RetrofitEdit, RetrofitSkipped } from "./types";

/**
 * Add-locales (design D9): adding a locale must also extend the locale lists in
 * the integration config files the create path generated. Each rewriter mirrors
 * the exact block emitted by `processors/i18n/integrations.ts` and returns
 * `undefined` when the anchor is missing, so a user-modified config is reported
 * as a manual step instead of being edited in the wrong place.
 */

type LocaleRewriter = (content: string, options: I18nOptions) => string | undefined;

interface LocaleTarget {
  readonly integration: I18nIntegrationId;
  readonly path: string;
  readonly rewrite: LocaleRewriter;
}

function renderNuxtLocales(options: I18nOptions): string {
  const strategy = options.routing?.strategy ?? "cookie";
  const domains = options.routing?.domains ?? {};
  const entries = options.locales.map((locale) => {
    const domain = strategy === "domain" ? domains[locale] : undefined;
    const domainPart = domain === undefined ? "" : `, domain: ${JSON.stringify(domain)}`;
    return `      { code: ${JSON.stringify(locale)}, language: ${JSON.stringify(locale)}${domainPart} },`;
  });
  return `locales: [\n${entries.join("\n")}\n    ]`;
}

function replaceDefaultLocale(content: string, sourceLocale: string): string {
  return content.replace(
    /defaultLocale:\s*"[^"]*"/,
    `defaultLocale: ${JSON.stringify(sourceLocale)}`,
  );
}

function rewriteNuxtI18n(content: string, options: I18nOptions): string | undefined {
  const blockStart = content.indexOf("\n  i18n: {");
  if (blockStart === -1) return undefined;
  const match = /locales:\s*\[[^\]]*\]/.exec(content.slice(blockStart));
  if (!match || match.index === undefined) return undefined;

  const start = blockStart + match.index;
  const next = `${content.slice(0, start)}${renderNuxtLocales(options)}${content.slice(start + match[0].length)}`;
  return replaceDefaultLocale(next, options.sourceLocale);
}

function rewriteAstroI18n(content: string, options: I18nOptions): string | undefined {
  const blockStart = content.indexOf("\n  i18n: {");
  if (blockStart === -1) return undefined;
  const match = /locales:\s*\[[^\]]*\]/.exec(content.slice(blockStart));
  if (!match || match.index === undefined) return undefined;

  const locales = options.locales.map((locale) => JSON.stringify(locale)).join(", ");
  const start = blockStart + match.index;
  const next = `${content.slice(0, start)}locales: [${locales}]${content.slice(start + match[0].length)}`;
  return replaceDefaultLocale(next, options.sourceLocale);
}

function matchingBrace(content: string, openIndex: number): number | undefined {
  let depth = 0;
  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function languageLabel(locale: string): string {
  try {
    const label = new Intl.DisplayNames([locale], { type: "language" }).of(locale);
    if (label !== undefined) return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  } catch {
    // Fall through to the raw tag.
  }
  return locale;
}

function objectKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function rewriteStarlight(content: string, options: I18nOptions): string | undefined {
  const blockStart = content.indexOf("\n    locales: {");
  if (blockStart === -1) return undefined;

  const openIndex = content.indexOf("{", blockStart);
  const closeIndex = matchingBrace(content, openIndex);
  if (closeIndex === undefined) return undefined;

  const entries = options.locales.map((locale) => {
    const key = locale === options.sourceLocale ? "root" : objectKey(locale);
    return `      ${key}: { label: ${JSON.stringify(languageLabel(locale))}, lang: ${JSON.stringify(locale)} },`;
  });
  const replacement = `locales: {\n${entries.join("\n")}\n    }`;
  const next = `${content.slice(0, blockStart)}${replacement}${content.slice(closeIndex + 1)}`;
  return replaceDefaultLocale(next, options.sourceLocale);
}

function rewriteFumadocs(content: string, options: I18nOptions): string | undefined {
  const match = /languages:\s*\[[^\]]*\]/.exec(content);
  if (!match || match.index === undefined) return undefined;

  const entries = options.locales.map((locale) => `    ${JSON.stringify(locale)},`);
  const next = `${content.slice(0, match.index)}languages: [\n${entries.join("\n")}\n  ]${content.slice(match.index + match[0].length)}`;
  return next.replace(
    /defaultLanguage:\s*"[^"]*"/,
    `defaultLanguage: ${JSON.stringify(options.sourceLocale)}`,
  );
}

function rewriteExpoPolyfills(content: string, options: I18nOptions): string | undefined {
  const localeDataBlock =
    /(?:import "@formatjs\/intl-(?:pluralrules|numberformat|datetimeformat|relativetimeformat|listformat|displaynames)\/locale-data\/[^"]+";\n?)+/;
  if (!localeDataBlock.test(content)) return undefined;

  const languages = [
    ...new Set(options.locales.map((locale) => locale.toLowerCase().split("-")[0] ?? "")),
  ];
  const imports = languages
    .map((language) =>
      [
        `import "@formatjs/intl-pluralrules/locale-data/${language}";`,
        `import "@formatjs/intl-numberformat/locale-data/${language}";`,
        `import "@formatjs/intl-datetimeformat/locale-data/${language}";`,
        `import "@formatjs/intl-relativetimeformat/locale-data/${language}";`,
        `import "@formatjs/intl-listformat/locale-data/${language}";`,
        `import "@formatjs/intl-displaynames/locale-data/${language}";`,
      ].join("\n"),
    )
    .join("\n");

  return content.replace(localeDataBlock, `${imports}\n`);
}

const LOCALE_TARGETS: readonly LocaleTarget[] = [
  { integration: "nuxt-i18n-module", path: "apps/web/nuxt.config.ts", rewrite: rewriteNuxtI18n },
  {
    integration: "astro-i18n-routing",
    path: "apps/web/astro.config.mjs",
    rewrite: rewriteAstroI18n,
  },
  { integration: "starlight-i18n", path: "apps/docs/astro.config.mjs", rewrite: rewriteStarlight },
  { integration: "fumadocs-i18n", path: "apps/fumadocs/lib/i18n.ts", rewrite: rewriteFumadocs },
  {
    integration: "expo-localization",
    path: "apps/native/polyfills/intl.ts",
    rewrite: rewriteExpoPolyfills,
  },
];

export interface IntegrationLocaleInput {
  projectDir: string;
  config: ProjectConfig;
  library: I18nLibrary;
  options: I18nOptions;
}

export interface IntegrationLocalePlan {
  edits: RetrofitEdit[];
  skipped: RetrofitSkipped[];
}

export async function buildIntegrationLocaleEdits(
  input: IntegrationLocaleInput,
): Promise<Result<IntegrationLocalePlan, CLIError>> {
  return Result.tryPromise({
    try: async () => {
      const active = new Set(
        getI18nIntegrations(toI18nConfigInput(input.config), input.library).map(
          (integration) => integration.id,
        ),
      );
      const edits: RetrofitEdit[] = [];
      const skipped: RetrofitSkipped[] = [];

      for (const target of LOCALE_TARGETS) {
        if (!active.has(target.integration)) continue;
        const fullPath = path.join(input.projectDir, target.path);
        if (!(await fs.pathExists(fullPath))) continue;

        const content = await fs.readFile(fullPath, "utf-8");
        const next = target.rewrite(content, input.options);
        if (next === undefined) {
          edits.push({
            kind: "manual",
            path: target.path,
            description: `Update the locale list in ${target.path} for the added locale(s); the generated anchor was missing.`,
          });
          continue;
        }
        if (next === content) {
          skipped.push({ path: target.path, reason: "Locale list already up to date" });
          continue;
        }
        edits.push({
          kind: "config-edit",
          path: target.path,
          description: `Update the locale list in ${target.path}`,
          content: next,
        });
      }

      return { edits, skipped };
    },
    catch: (cause: unknown) =>
      new CLIError({
        message: `Failed to update integration locale lists: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}
