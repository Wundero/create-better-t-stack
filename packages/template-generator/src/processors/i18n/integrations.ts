import {
  getI18nIntegrations,
  getI18nSurfaces,
  I18nOptionsSchema,
  type I18nIntegrationId,
  type I18nSurface,
  type ProjectConfig,
} from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import { processSingleTemplate, type TemplateData } from "../../template-handlers/utils";
import { addPackageDependency, type AvailableDependencies } from "../../utils/add-deps";

/**
 * Built-in localization integrations (lane L7).
 *
 * Every handler is keyed by an `I18nIntegrationId` from
 * `packages/types/src/i18n.ts` and runs only when that entry's `when()` holds —
 * `getI18nIntegrations` stays the single source of truth, and surfaces are
 * always derived through `getI18nSurfaces`. Integrations owned by
 * other lanes (`payments-checkout-locale`, `shadcn-direction`,
 * `react-email-locale`, `server-locale-middleware`, `lingui-bun-preload`)
 * have no handler here: they live on the stacked branches or in L6.
 *
 * Two phases mirror `template-handlers/i18n.ts` and `processors/i18n-deps.ts`:
 * - `processI18nIntegrationTemplates` emits new files from
 *   `templates/i18n/integrations/**`.
 * - `processI18nIntegrations` adds dependencies and patches generated files
 *   (configs, runtimes, providers). Every anchor is single-occurrence; a
 *   missing or duplicated anchor is skipped instead of editing the wrong place.
 */

/** Schema defaults (L1 owns them); never re-encode locales or routing here. */
const DEFAULT_I18N_OPTIONS = I18nOptionsSchema.parse({});

/** `@better-auth/i18n` built-in translations (language subtags). */
const BETTER_AUTH_LOCALES = [
  "ar",
  "bn",
  "de",
  "en",
  "es",
  "fa",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "sv",
  "th",
  "tr",
  "uk",
  "vi",
  "zh",
] as const;

/** Language subtags covered by at least one `@clerk/localizations` bundle. */
const CLERK_LOCALES = [
  "ar",
  "be",
  "bg",
  "bn",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fa",
  "fi",
  "fr",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "is",
  "it",
  "ja",
  "kk",
  "ko",
  "mn",
  "ms",
  "nb",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sr",
  "sv",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "vi",
  "zh",
] as const;

const INTL_POLYFILL_PACKAGES = [
  "@formatjs/intl-getcanonicallocales",
  "@formatjs/intl-locale",
  "@formatjs/intl-pluralrules",
  "@formatjs/intl-numberformat",
  "@formatjs/intl-datetimeformat",
  "@formatjs/intl-relativetimeformat",
  "@formatjs/intl-listformat",
  "@formatjs/intl-displaynames",
] as const;

// --- generic helpers ---------------------------------------------------------

interface IntegrationContext {
  readonly vfs: VirtualFileSystem;
  readonly config: ProjectConfig;
  /** Present only in the template phase. */
  readonly templates: TemplateData | undefined;
}

function localesOf(config: ProjectConfig): string[] {
  const configured = config.i18nOptions?.locales;
  return configured && configured.length > 0 ? [...configured] : [...DEFAULT_I18N_OPTIONS.locales];
}

function sourceLocaleOf(config: ProjectConfig): string {
  return config.i18nOptions?.sourceLocale ?? DEFAULT_I18N_OPTIONS.sourceLocale;
}

function surfacesOf(config: ProjectConfig): I18nSurface[] {
  return getI18nSurfaces(config);
}

function hasAnySurface(config: ProjectConfig, surfaces: readonly I18nSurface[]): boolean {
  const present = surfacesOf(config);
  return surfaces.some((surface) => present.includes(surface));
}

function languageOf(tag: string): string {
  return tag.toLowerCase().split("-")[0] ?? "";
}

function addSeededDependency(
  vfs: VirtualFileSystem,
  packagePath: string,
  dependencies: AvailableDependencies[] = [],
  devDependencies: AvailableDependencies[] = [],
): void {
  if (!vfs.exists(packagePath)) return;
  addPackageDependency({ vfs, packagePath, dependencies, devDependencies });
}

function addWorkspaceDependency(
  vfs: VirtualFileSystem,
  packagePath: string,
  config: ProjectConfig,
): void {
  if (!vfs.exists(packagePath)) return;
  const version = config.packageManager === "npm" ? "*" : "workspace:*";
  addPackageDependency({
    vfs,
    packagePath,
    customDependencies: { [`@${config.projectName}/i18n`]: version },
  });
}

function patchFile(
  vfs: VirtualFileSystem,
  filePath: string,
  transform: (content: string) => string | undefined,
): void {
  const content = vfs.readFile(filePath);
  if (content === undefined) return;
  const next = transform(content);
  if (next !== undefined && next !== content) vfs.writeFile(filePath, next);
}

function insertAfterOnce(content: string, anchor: string, addition: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index + anchor.length) + addition + content.slice(index + anchor.length);
}

function insertBeforeOnce(content: string, anchor: string, addition: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index) + addition + content.slice(index);
}

function replaceOnce(content: string, anchor: string, replacement: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index) + replacement + content.slice(index + anchor.length);
}

function appendAfterLastImport(content: string, statement: string): string {
  const imports = [...content.matchAll(/^import [^\n]*;$/gm)];
  const last = imports[imports.length - 1];
  if (last && last.index !== undefined) {
    const index = last.index + last[0].length;
    return `${content.slice(0, index)}\n${statement}${content.slice(index)}`;
  }
  const firstLineEnd = content.indexOf("\n");
  if (firstLineEnd === -1) return `${statement}\n${content}`;
  return `${content.slice(0, firstLineEnd + 1)}\n${statement}${content.slice(firstLineEnd + 1)}`;
}

function prependImportOnce(content: string, statement: string, marker: string): string | undefined {
  if (content.includes(marker)) return undefined;
  return `${statement}\n${content}`;
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let index = content.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(needle, index + needle.length);
  }
  return count;
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

function warn(message: string): void {
  console.warn(`[i18n] ${message}`);
}

// --- better-auth-i18n --------------------------------------------------------

function betterAuthBuiltinFor(locale: string): string | undefined {
  const language = languageOf(locale);
  return (BETTER_AUTH_LOCALES as readonly string[]).includes(language) ? language : undefined;
}

function betterAuthTranslationsConst(config: ProjectConfig): string {
  const locales = localesOf(config);
  const source = sourceLocaleOf(config);
  const lines = locales.map((locale) => {
    const builtin = betterAuthBuiltinFor(locale) ?? "en";
    return `  ${JSON.stringify(locale)}: { ...betterAuthLocales.${builtin}, ...(betterAuthTranslations[${JSON.stringify(locale)}] ?? {}) },`;
  });

  for (const locale of locales) {
    if (betterAuthBuiltinFor(locale) === undefined) {
      warn(
        `better-auth-i18n: locale "${locale}" has no built-in @better-auth/i18n translation; it falls back to English.`,
      );
    }
  }

  const defaultLocale = betterAuthBuiltinFor(source) === undefined ? "en" : source;
  const hasDefault = locales.some((locale) => betterAuthBuiltinFor(locale) === defaultLocale);
  if (!hasDefault) {
    lines.push(`  "en": { ...betterAuthLocales.en, ...(betterAuthTranslations["en"] ?? {}) },`);
  }

  return [
    "const betterAuthI18nTranslations: Record<string, TranslationDictionary> = {",
    ...lines,
    "};",
  ].join("\n");
}

function betterAuthDefaultLocale(config: ProjectConfig): string {
  const source = sourceLocaleOf(config);
  return betterAuthBuiltinFor(source) === undefined ? "en" : source;
}

function betterAuthPluginSnippet(config: ProjectConfig): string {
  return [
    "",
    "      i18n({",
    "        translations: betterAuthI18nTranslations,",
    `        defaultLocale: ${JSON.stringify(betterAuthDefaultLocale(config))},`,
    '        detection: ["callback", "session", "cookie", "header"],',
    "        localeCookie: LOCALE_COOKIE,",
    '        userLocaleField: "locale",',
    "        getLocale: (ctx) =>",
    "          ctx.headers?.get(LOCALE_HEADER) ?? ctx.request?.headers.get(LOCALE_HEADER) ?? null,",
    "      }),",
  ].join("\n");
}

function betterAuthUserSnippet(): string {
  return [
    "",
    "    user: {",
    "      additionalFields: {",
    "        // Run `auth:generate` (Better Auth CLI) and migrate after adding this field.",
    '        locale: { type: "string", required: false },',
    "      },",
    "    },",
  ].join("\n");
}

function betterAuthImports(config: ProjectConfig): string {
  return [
    'import { i18n, locales as betterAuthLocales } from "@better-auth/i18n";',
    'import type { TranslationDictionary } from "@better-auth/i18n";',
    `import { LOCALE_COOKIE, LOCALE_HEADER } from "@${config.projectName}/i18n/config";`,
    `import { betterAuthTranslations } from "@${config.projectName}/i18n/integrations/better-auth";`,
  ].join("\n");
}

function patchBetterAuthFile(
  vfs: VirtualFileSystem,
  filePath: string,
  importAnchor: string,
  config: ProjectConfig,
): void {
  patchFile(vfs, filePath, (content) => {
    const withImports = insertAfterOnce(content, importAnchor, `\n${betterAuthImports(config)}`);
    if (!withImports) return undefined;
    const withTranslations = appendAfterLastImport(
      withImports,
      `\n${betterAuthTranslationsConst(config)}`,
    );
    const withPlugin = insertAfterOnce(
      withTranslations,
      "    plugins: [",
      betterAuthPluginSnippet(config),
    );
    if (!withPlugin) return undefined;
    return insertAfterOnce(withPlugin, "  return betterAuth({", betterAuthUserSnippet());
  });
}

function patchBetterAuthServer(vfs: VirtualFileSystem, config: ProjectConfig): void {
  patchBetterAuthFile(
    vfs,
    "packages/auth/src/index.ts",
    'import { betterAuth } from "better-auth";',
    config,
  );
}

function patchBetterAuthConvexServer(vfs: VirtualFileSystem, config: ProjectConfig): void {
  patchBetterAuthFile(
    vfs,
    "packages/backend/convex/auth.ts",
    'import { betterAuth } from "better-auth/minimal";',
    config,
  );
}

function patchBetterAuthSchema(vfs: VirtualFileSystem): void {
  patchFile(vfs, "packages/db/src/schema/auth.ts", (content) => {
    return content.replace(/^(\s*)image:\s*text\("image"\),$/m, (line, indent: string) => {
      return `${line}\n${indent}locale: text("locale"),`;
    });
  });

  patchFile(vfs, "packages/db/prisma/schema/auth.prisma", (content) => {
    return content.replace(/^(\s*)image\s+String\?(?:\s+@db\.Text)?$/m, (line, indent: string) => {
      return `${line}\n${indent}locale String?`;
    });
  });

  patchFile(vfs, "packages/db/src/models/auth.model.ts", (content) => {
    return content.replace(/^(\s*)image: \{ type: String \},$/m, (line, indent: string) => {
      return `${line}\n${indent}locale: { type: String },`;
    });
  });
}

function processBetterAuth(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  if (config.backend === "convex") {
    addSeededDependency(vfs, "packages/backend/package.json", ["@better-auth/i18n"]);
    addWorkspaceDependency(vfs, "packages/backend/package.json", config);
    patchBetterAuthConvexServer(vfs, config);
    return;
  }

  addSeededDependency(vfs, "packages/auth/package.json", ["@better-auth/i18n"]);
  addWorkspaceDependency(vfs, "packages/auth/package.json", config);
  patchBetterAuthServer(vfs, config);
  patchBetterAuthSchema(vfs);
}

// --- clerk-localizations -----------------------------------------------------

const CLERK_WEB_PROVIDER_FILES = [
  "apps/web/src/app/layout.tsx",
  "apps/web/src/routes/__root.tsx",
  "apps/web/src/root.tsx",
  "apps/web/src/main.tsx",
] as const;

const CLERK_NATIVE_PROVIDER_FILES = ["apps/native/app/_layout.tsx"] as const;

interface ClerkProviderPatch {
  readonly wrapperImport: string;
}

function patchClerkProviderFile(content: string, patch: ClerkProviderPatch): string | undefined {
  if (countOccurrences(content, "<ClerkProvider") !== 1) return undefined;
  if (!content.includes("</ClerkProvider>")) return undefined;

  const importPattern = /^([ \t]*)import \{ ClerkProvider(?:, useAuth)? \} from "([^"]+)";$/m;
  const importMatch = importPattern.exec(content);
  if (!importMatch || importMatch.index === undefined) return undefined;

  const indent = importMatch[1] ?? "";
  const keepsUseAuth = importMatch[0].includes("useAuth");
  const importReplacement = keepsUseAuth
    ? `${indent}import { useAuth } from "${importMatch[2]}";\n${indent}import { ClerkLocalizationProvider } from "${patch.wrapperImport}";`
    : `${indent}import { ClerkLocalizationProvider } from "${patch.wrapperImport}";`;

  return content
    .slice(0, importMatch.index)
    .concat(importReplacement)
    .concat(content.slice(importMatch.index + importMatch[0].length))
    .replace("<ClerkProvider", "<ClerkLocalizationProvider")
    .replace("</ClerkProvider>", "</ClerkLocalizationProvider>");
}

function emitClerkFiles(ctx: IntegrationContext): void {
  const { vfs, config, templates } = ctx;
  if (templates === undefined) return;

  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/clerk/clerk-client.ts",
    "packages/i18n/src/integrations/clerk-client.ts",
    config,
  );

  if (hasWebReactSurface(config)) {
    processSingleTemplate(
      vfs,
      templates,
      "i18n/integrations/clerk/clerk-localization-provider.tsx",
      "apps/web/src/components/clerk-localization-provider.tsx",
      config,
    );
  }
  if (hasNativeSurface(config)) {
    processSingleTemplate(
      vfs,
      templates,
      "i18n/integrations/clerk/clerk-localization-provider.native.tsx",
      "apps/native/components/clerk-localization-provider.tsx",
      config,
    );
  }
}

function processClerk(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  addSeededDependency(vfs, "packages/i18n/package.json", ["@clerk/localizations"]);

  const unsupported = localesOf(config).filter(
    (locale) => !(CLERK_LOCALES as readonly string[]).includes(languageOf(locale)),
  );
  for (const locale of unsupported) {
    warn(
      `clerk-localizations: locale "${locale}" has no @clerk/localizations bundle; it falls back to English.`,
    );
  }

  const webPatch: ClerkProviderPatch = {
    wrapperImport: "@/components/clerk-localization-provider",
  };
  if (hasWebReactSurface(config)) {
    for (const file of CLERK_WEB_PROVIDER_FILES) {
      patchFile(vfs, file, (content) => patchClerkProviderFile(content, webPatch));
    }
  }
  if (hasNativeSurface(config)) {
    for (const file of CLERK_NATIVE_PROVIDER_FILES) {
      patchFile(vfs, file, (content) => patchClerkProviderFile(content, webPatch));
    }
  }
}

// --- zod-locales -------------------------------------------------------------

const WEB_REACT_SURFACES = [
  "next",
  "tanstack-start",
  "tanstack-router",
  "react-router",
] as const satisfies readonly I18nSurface[];

const NATIVE_SURFACES = ["native"] as const satisfies readonly I18nSurface[];

function hasWebReactSurface(config: ProjectConfig): boolean {
  return hasAnySurface(config, WEB_REACT_SURFACES);
}

function hasNativeSurface(config: ProjectConfig): boolean {
  return hasAnySurface(config, NATIVE_SURFACES);
}

function wireZodIntoRuntime(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const library = config.i18n;
  const file = "packages/i18n/src/runtime.ts";
  const content = vfs.readFile(file);
  if (content === undefined || !library || library === "none") return;

  const importStatement = 'import { applyZodLocale } from "./integrations/zod-client";';

  switch (library) {
    case "lingui": {
      const withImport = appendAfterLastImport(content, importStatement);
      const withCall = replaceOnce(
        withImport,
        "  i18n.activate(locale);",
        "  i18n.activate(locale);\n  await applyZodLocale(locale);",
      );
      if (withCall !== undefined) vfs.writeFile(file, withCall);
      break;
    }
    case "i18next": {
      const call = [
        "export async function setLocale(locale: Locale): Promise<void> {",
        "  initI18next();",
        "  await i18next.changeLanguage(locale);",
        "  await applyZodLocale(locale);",
        "}",
      ].join("\n");
      const withCall = replaceOnce(
        content,
        [
          "export function setLocale(locale: Locale): Promise<unknown> {",
          "  initI18next();",
          "  return i18next.changeLanguage(locale);",
          "}",
        ].join("\n"),
        call,
      );
      if (withCall !== undefined)
        vfs.writeFile(file, appendAfterLastImport(withCall, importStatement));
      break;
    }
    case "paraglide": {
      const withImports = appendAfterLastImport(
        appendAfterLastImport(content, importStatement),
        'import { setLocale as applyParaglideLocale } from "./paraglide/runtime.js";',
      );
      const wrapper = [
        "",
        "type ParaglideLocale = Parameters<typeof applyParaglideLocale>[0];",
        "",
        "/** Activates a Paraglide locale and keeps Zod's messages in sync. */",
        "export async function setLocale(locale: ParaglideLocale): Promise<void> {",
        "  await applyParaglideLocale(locale);",
        "  await applyZodLocale(locale);",
        "}",
        "",
      ].join("\n");
      vfs.writeFile(file, `${withImports}${wrapper}`);
      break;
    }
    case "wuchale": {
      const replacement = [
        "import {",
        "  commitLocale as applyWuchaleLocale,",
        "  loadLocale as loadWuchaleLocale,",
        '} from "wuchale/load-utils";',
        importStatement,
        "",
        'export { loadLocaleSync, registerLoaders } from "wuchale/load-utils";',
        "",
        "export function commitLocale(locale: string): void {",
        "  applyWuchaleLocale(locale);",
        "  void applyZodLocale(locale);",
        "}",
        "",
        "export async function loadLocale(locale: string, commit = true): Promise<void> {",
        "  await loadWuchaleLocale(locale, commit);",
        "  if (commit) await applyZodLocale(locale);",
        "}",
      ].join("\n");
      const withCall = replaceOnce(
        content,
        'export { commitLocale, loadLocale, loadLocaleSync, registerLoaders } from "wuchale/load-utils";',
        replacement,
      );
      if (withCall !== undefined) vfs.writeFile(file, withCall);
      break;
    }
  }
}

function emitZodFiles(ctx: IntegrationContext): void {
  const { vfs, config, templates } = ctx;
  if (templates === undefined) return;
  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/zod/zod-client.ts",
    "packages/i18n/src/integrations/zod-client.ts",
    config,
  );
}

function processZod(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  addSeededDependency(vfs, "packages/i18n/package.json", ["zod"]);
  wireZodIntoRuntime(vfs, config);
}

// --- turnstile-language ------------------------------------------------------

function emitTurnstileFiles(ctx: IntegrationContext): void {
  const { vfs, config, templates } = ctx;
  if (templates === undefined) return;

  // `addons/turnstile/**` widget templates import this map, so the output path
  // is a cross-namespace contract, not a local detail.
  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/turnstile/turnstile.ts",
    "packages/i18n/src/integrations/turnstile.ts",
    config,
  );
}

// --- nuxt-ui-locale ----------------------------------------------------------

const UI_LOCALE_COMPOSABLE = "apps/web/app/composables/use-ui-locale.ts";

function emitNuxtUiFiles(ctx: IntegrationContext): void {
  const { vfs, config, templates } = ctx;
  if (templates === undefined) return;
  if (!vfs.exists("apps/web/app/app.vue")) return;
  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/nuxt/use-ui-locale.ts",
    UI_LOCALE_COMPOSABLE,
    config,
  );
}

function processNuxtUi(ctx: IntegrationContext): void {
  const { vfs } = ctx;
  patchFile(vfs, "apps/web/app/app.vue", (content) => {
    let next = insertAfterOnce(
      content,
      '<script setup lang="ts">',
      '\nimport { useUiLocale } from "./composables/use-ui-locale";',
    );
    if (!next) return undefined;
    next = insertAfterOnce(
      next,
      'import { useUiLocale } from "./composables/use-ui-locale";',
      "\n\nconst uiLocale = useUiLocale();",
    );
    if (!next) return undefined;
    return next.replace("<UApp>", '<UApp :locale="uiLocale">');
  });
}

// --- nuxt-i18n-module --------------------------------------------------------

function nuxtLocalesLiteral(config: ProjectConfig): string {
  const strategy = config.i18nOptions?.routing?.strategy ?? "cookie";
  const domains = config.i18nOptions?.routing?.domains ?? {};
  const lines = localesOf(config).map((locale) => {
    const domain = strategy === "domain" ? domains[locale] : undefined;
    const domainPart = domain === undefined ? "" : `, domain: ${JSON.stringify(domain)}`;
    return `      { code: ${JSON.stringify(locale)}, language: ${JSON.stringify(locale)}${domainPart} },`;
  });
  return lines.join("\n");
}

function nuxtI18nSnippet(config: ProjectConfig): string {
  const strategy = config.i18nOptions?.routing?.strategy ?? "cookie";
  const prefixDefault = config.i18nOptions?.routing?.prefixDefaultLocale === true;
  const source = sourceLocaleOf(config);

  const lines = [
    "",
    "  i18n: {",
    "    locales: [",
    nuxtLocalesLiteral(config),
    "    ],",
    `    defaultLocale: ${JSON.stringify(source)},`,
  ];

  if (strategy === "domain") {
    lines.push(
      '    strategy: "no_prefix",',
      "    differentDomains: true,",
      "    detectBrowserLanguage: false,",
    );
  } else if (strategy === "prefix") {
    lines.push(
      `    strategy: ${JSON.stringify(prefixDefault ? "prefix" : "prefix_except_default")},`,
      '    detectBrowserLanguage: { useCookie: true, cookieKey: "locale", redirect: true, redirectOn: "root" },',
    );
  } else {
    lines.push(
      '    strategy: "no_prefix",',
      '    detectBrowserLanguage: { useCookie: true, cookieKey: "locale", redirect: false },',
    );
  }

  lines.push("  },");
  return lines.join("\n");
}

function processNuxtI18nModule(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  addSeededDependency(vfs, "apps/web/package.json", ["@nuxtjs/i18n"]);
  patchFile(vfs, "apps/web/nuxt.config.ts", (content) => {
    const withModule = insertAfterOnce(content, "'@nuxt/ui'", ",\n    '@nuxtjs/i18n'");
    if (!withModule) return undefined;
    return insertAfterOnce(
      withModule,
      "  css: ['~/assets/css/main.css'],",
      nuxtI18nSnippet(config),
    );
  });
}

// --- astro-i18n-routing ------------------------------------------------------

function astroI18nSnippet(config: ProjectConfig): string {
  const strategy = config.i18nOptions?.routing?.strategy ?? "cookie";
  const prefixDefault = config.i18nOptions?.routing?.prefixDefaultLocale === true;
  const locales = localesOf(config)
    .map((locale) => JSON.stringify(locale))
    .join(", ");
  const lines = [
    "",
    "  i18n: {",
    `    defaultLocale: ${JSON.stringify(sourceLocaleOf(config))},`,
    `    locales: [${locales}],`,
  ];
  if (strategy === "prefix") {
    lines.push(`    routing: { prefixDefaultLocale: ${prefixDefault ? "true" : "false"} },`);
  }
  // Astro `i18n.domains` (locale → absolute URL) belongs here once
  // `getI18nRoutingSupport` stops blocking `domain` for astro's static/SPA
  // surfaces (L6 merge).
  lines.push("  },");
  return lines.join("\n");
}

function processAstro(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  patchFile(vfs, "apps/web/astro.config.mjs", (content) =>
    insertAfterOnce(content, "export default defineConfig({", astroI18nSnippet(config)),
  );
}

// --- starlight-i18n ----------------------------------------------------------

function objectKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function starlightI18nSnippet(config: ProjectConfig): string {
  const source = sourceLocaleOf(config);
  const lines = ["", `    defaultLocale: ${JSON.stringify(source)},`, "    locales: {"];
  for (const locale of localesOf(config)) {
    const key = locale === source ? "root" : objectKey(locale);
    lines.push(
      `      ${key}: { label: ${JSON.stringify(languageLabel(locale))}, lang: ${JSON.stringify(locale)} },`,
    );
  }
  lines.push("    },");
  return lines.join("\n");
}

function processStarlight(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  // `create-astro --template starlight` scaffolds `apps/docs` after generation.
  // On the Create Path the app does not exist yet, so this is a no-op for the
  // Add Path to re-run.
  if (!vfs.exists("apps/docs/astro.config.mjs")) return;
  patchFile(vfs, "apps/docs/astro.config.mjs", (content) =>
    insertAfterOnce(content, "starlight({", starlightI18nSnippet(config)),
  );
}

// --- fumadocs-i18n -----------------------------------------------------------

function emitFumadocsFiles(ctx: IntegrationContext): void {
  const { vfs, config, templates } = ctx;
  if (templates === undefined) return;
  if (!vfs.exists("apps/fumadocs/package.json")) return;
  if (vfs.exists("apps/fumadocs/lib/i18n.ts")) return;
  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/fumadocs/lib/i18n.ts",
    "apps/fumadocs/lib/i18n.ts",
    config,
  );
}

function processFumadocs(ctx: IntegrationContext): void {
  const { vfs } = ctx;
  patchFile(vfs, "apps/fumadocs/lib/source.ts", (content) => {
    const withImport = appendAfterLastImport(content, 'import { i18n } from "@/lib/i18n";');
    return insertAfterOnce(withImport, "loader({", "\n  i18n,");
  });
}

// --- pwa-manifest-lang -------------------------------------------------------

function processPwaManifestLang(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  const source = sourceLocaleOf(config);
  const i18nConfigImport = `import { getTextDirection } from "@${config.projectName}/i18n/config";`;

  patchFile(vfs, "apps/web/src/app/manifest.ts", (content) => {
    const withImport = appendAfterLastImport(content, i18nConfigImport);
    return insertAfterOnce(
      withImport,
      "\treturn {",
      `\n\t\tlang: ${JSON.stringify(source)},\n\t\tdir: getTextDirection(${JSON.stringify(source)}),`,
    );
  });

  patchFile(vfs, "apps/web/public/favicon/site.webmanifest", (content) =>
    insertBeforeOnce(content, '"short_name"', `"lang": ${JSON.stringify(source)},\n\t`),
  );

  patchFile(vfs, "apps/web/index.html", (content) =>
    replaceOnce(content, '<html lang="en">', `<html lang="${source}">`),
  );
}

// --- wxt-i18n ----------------------------------------------------------------

function workspaceScriptCommand(config: ProjectConfig, script: string): string {
  const workspace = `@${config.projectName}/i18n`;
  const { addons, packageManager } = config;
  if (addons.includes("turborepo")) return `turbo run ${script} -F ${workspace} --`;
  if (addons.includes("nx")) return `nx run-many -t ${script} --projects=${workspace}`;
  if (addons.includes("vite-plus")) return `vp run --filter ${workspace} ${script}`;
  switch (packageManager) {
    case "pnpm":
      return `pnpm --filter ${workspace} ${script}`;
    case "npm":
      return `npm run ${script} --workspace ${workspace} --`;
    default:
      return `bun run --filter ${workspace} ${script}`;
  }
}

function registerSyncWxtScript(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const packagePath = "packages/i18n/package.json";
  const pkg = vfs.readJson<{ scripts?: Record<string, string> }>(packagePath);
  if (pkg === undefined) return;
  // The sync reads `dist/catalog.json`, so the package script runs `i18n:export`
  // first; the root script (below) only forwards to this package script.
  pkg.scripts = {
    ...pkg.scripts,
    "i18n:sync-wxt": "bun run scripts/export.ts && bun run scripts/sync-wxt.ts",
  };
  vfs.writeJson(packagePath, pkg);

  const rootPath = "package.json";
  const root = vfs.readJson<{ scripts?: Record<string, string> }>(rootPath);
  if (root === undefined) return;
  root.scripts = {
    ...root.scripts,
    "i18n:sync-wxt": workspaceScriptCommand(config, "i18n:sync-wxt"),
  };
  vfs.writeJson(rootPath, root);
}

function processWxt(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  registerSyncWxtScript(vfs, config);

  // `wxt init` scaffolds `apps/extension` after generation; dependency and
  // config wiring therefore runs only when the app already exists (Add Path).
  if (!vfs.exists("apps/extension/package.json")) return;
  addSeededDependency(vfs, "apps/extension/package.json", ["@wxt-dev/i18n"]);

  patchFile(vfs, "apps/extension/wxt.config.ts", (content) => {
    if (content.includes("modules:")) {
      return insertAfterOnce(content, "modules: [", '"@wxt-dev/i18n/module", ');
    }
    return insertAfterOnce(content, "defineConfig({", '\n  modules: ["@wxt-dev/i18n/module"],');
  });
  patchFile(vfs, "apps/extension/wxt.config.ts", (content) =>
    insertAfterOnce(
      content,
      "manifest: {",
      `\n    default_locale: ${JSON.stringify(sourceLocaleOf(config))},`,
    ),
  );
}

function emitWxtFiles(ctx: IntegrationContext): void {
  const { vfs, config, templates } = ctx;
  if (templates === undefined) return;
  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/wxt/sync-wxt.ts",
    "packages/i18n/scripts/sync-wxt.ts",
    config,
  );
}

// --- expo-localization -------------------------------------------------------

function intlPolyfillsContent(config: ProjectConfig): string {
  const languages = [...new Set(localesOf(config).map((locale) => languageOf(locale)))];
  const localeData = languages
    .map(
      (language) =>
        `import "@formatjs/intl-pluralrules/locale-data/${language}";\nimport "@formatjs/intl-numberformat/locale-data/${language}";\nimport "@formatjs/intl-datetimeformat/locale-data/${language}";\nimport "@formatjs/intl-relativetimeformat/locale-data/${language}";\nimport "@formatjs/intl-listformat/locale-data/${language}";\nimport "@formatjs/intl-displaynames/locale-data/${language}";`,
    )
    .join("\n");
  return [
    "/**",
    " * Hermes ships an incomplete `Intl`. These polyfills back the shared",
    " * formatters (`createFormatters`), `negotiateLocale` and `getTextDirection`,",
    " * with locale data for every configured language.",
    " */",
    'import "@formatjs/intl-getcanonicallocales/polyfill.js";',
    'import "@formatjs/intl-locale/polyfill.js";',
    'import "@formatjs/intl-pluralrules/polyfill.js";',
    'import "@formatjs/intl-numberformat/polyfill.js";',
    'import "@formatjs/intl-datetimeformat/polyfill.js";',
    'import "@formatjs/intl-relativetimeformat/polyfill.js";',
    'import "@formatjs/intl-listformat/polyfill.js";',
    'import "@formatjs/intl-displaynames/polyfill.js";',
    localeData,
    "",
  ].join("\n");
}

function emitExpoFiles(ctx: IntegrationContext): void {
  const { vfs, config, templates } = ctx;
  if (templates === undefined) return;
  if (!vfs.exists("apps/native/package.json")) return;

  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/expo/device-locale.ts",
    "apps/native/lib/device-locale.ts",
    config,
  );
  vfs.writeFile("apps/native/polyfills/intl.ts", intlPolyfillsContent(config));
}

function patchNativeIntlEntry(vfs: VirtualFileSystem): void {
  const indexPath = "apps/native/index.js";
  const indexContent = vfs.readFile(indexPath);
  if (indexContent !== undefined) {
    const next = prependImportOnce(indexContent, 'import "./polyfills/intl";', "polyfills/intl");
    if (next !== undefined) vfs.writeFile(indexPath, next);
    return;
  }

  patchFile(vfs, "apps/native/app/_layout.tsx", (content) =>
    prependImportOnce(content, 'import "../polyfills/intl";', "polyfills/intl"),
  );
}

function patchNativeDeviceLocale(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const deviceImport = 'import { getDeviceLocaleTag } from "@/lib/device-locale";';

  patchFile(vfs, "apps/native/components/i18n-provider.tsx", (content) => {
    const withImport = appendAfterLastImport(content, deviceImport);
    return replaceOnce(
      withImport,
      "system: Intl.DateTimeFormat().resolvedOptions().locale,",
      "system: getDeviceLocaleTag(),",
    );
  });

  patchFile(vfs, "apps/native/lib/i18n.ts", (content) => {
    const withImports = appendAfterLastImport(
      appendAfterLastImport(content, deviceImport),
      `import { negotiateLocale } from "@${config.projectName}/i18n";`,
    );
    return replaceOnce(
      withImports,
      "initI18next();",
      "initI18next(negotiateLocale({ system: getDeviceLocaleTag() }));",
    );
  });

  if (config.i18n === "paraglide") {
    patchFile(vfs, "apps/native/components/i18n-demo.tsx", (content) => {
      const withImports = appendAfterLastImport(
        appendAfterLastImport(
          appendAfterLastImport(
            content,
            `import { overwriteGetLocale } from "@${config.projectName}/i18n/runtime";`,
          ),
          deviceImport,
        ),
        `import { negotiateLocale } from "@${config.projectName}/i18n/config";`,
      );
      return insertBeforeOnce(
        withImports,
        "export function I18nDemo() {",
        "overwriteGetLocale(() => negotiateLocale({ system: getDeviceLocaleTag() }));\n\n",
      );
    });
  }
}

function processExpo(ctx: IntegrationContext): void {
  const { vfs, config } = ctx;
  addSeededDependency(vfs, "apps/native/package.json", [
    ...INTL_POLYFILL_PACKAGES,
    "expo-localization",
  ]);
  patchNativeIntlEntry(vfs);
  patchNativeDeviceLocale(vfs, config);
}

// --- dispatch ----------------------------------------------------------------

type IntegrationHandler = (ctx: IntegrationContext) => void;

type IntegrationHandlers = Partial<Record<I18nIntegrationId, IntegrationHandler>>;

const TEMPLATE_HANDLERS = {
  "clerk-localizations": emitClerkFiles,
  "zod-locales": emitZodFiles,
  "nuxt-ui-locale": emitNuxtUiFiles,
  "fumadocs-i18n": emitFumadocsFiles,
  "wxt-i18n": emitWxtFiles,
  "expo-localization": emitExpoFiles,
  "turnstile-language": emitTurnstileFiles,
} satisfies IntegrationHandlers;

const DEPENDENCY_HANDLERS = {
  "better-auth-i18n": processBetterAuth,
  "clerk-localizations": processClerk,
  "zod-locales": processZod,
  "nuxt-ui-locale": processNuxtUi,
  "nuxt-i18n-module": processNuxtI18nModule,
  "astro-i18n-routing": processAstro,
  "starlight-i18n": processStarlight,
  "fumadocs-i18n": processFumadocs,
  "pwa-manifest-lang": processPwaManifestLang,
  "wxt-i18n": processWxt,
  "expo-localization": processExpo,
} satisfies IntegrationHandlers;

function runHandlers(handlers: IntegrationHandlers, ctx: IntegrationContext): void {
  const library = ctx.config.i18n;
  if (!library || library === "none") return;
  for (const integration of getI18nIntegrations(ctx.config, library)) {
    const handler = handlers[integration.id];
    handler?.(ctx);
  }
}

/**
 * Emits `templates/i18n/integrations/**` for each active integration entry.
 * Called by `template-handlers/i18n.ts`.
 */
export function processI18nIntegrationTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): void {
  runHandlers(TEMPLATE_HANDLERS, { vfs, config, templates });
}

/**
 * Adds integration dependencies and patches generated files. Called by
 * `processors/i18n-deps.ts`.
 */
export function processI18nIntegrations(vfs: VirtualFileSystem, config: ProjectConfig): void {
  runHandlers(DEPENDENCY_HANDLERS, { vfs, config, templates: undefined });
}
