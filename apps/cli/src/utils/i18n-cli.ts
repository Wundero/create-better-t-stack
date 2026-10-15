import { Result } from "better-result";

import {
  getI18nRoutingSupport,
  I18nOptionsSchema,
  validateI18nCompatibility,
  validateI18nOptions,
  type CLIInput,
  type I18n,
  type I18nConfigInput,
  type I18nOptions,
  type I18nRoutingStrategy,
  type ProjectConfig,
} from "../types";
import { CLIError } from "./errors";

/** CLI-only flat flags that are folded into `i18nOptions` before config processing. */
export interface I18nCliFlagFields {
  i18n?: I18n;
  i18nOptions?: I18nOptions;
  i18nLocales?: string;
  i18nSourceLocale?: string;
  i18nRouting?: I18nRoutingStrategy;
  i18nDomain?: string[];
  i18nSkill?: boolean;
}

export type I18nCliInput = CLIInput & I18nCliFlagFields;

/** Build the shared i18n compatibility input from any partially resolved project config. */
export function toI18nConfigInput(config: Partial<ProjectConfig>): I18nConfigInput {
  return {
    frontend: config.frontend,
    backend: config.backend,
    runtime: config.runtime,
    auth: config.auth,
    api: config.api,
    payments: config.payments,
    addons: config.addons,
    addonOptions: config.addonOptions,
  };
}

export function parseI18nLocalesInput(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function invalidDomainEntry(entry: string): CLIError {
  return new CLIError({
    message: `Invalid --i18n-domain entry "${entry}". Use <locale>=<host>, for example fr=fr.example.com.`,
  });
}

function parseI18nDomainEntries(
  entries: readonly string[],
): Result<Record<string, string>, CLIError> {
  const domains: Record<string, string> = {};

  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0) return Result.err(invalidDomainEntry(entry));

    const locale = entry.slice(0, separator).trim();
    const host = entry.slice(separator + 1).trim();
    if (locale.length === 0 || host.length === 0) return Result.err(invalidDomainEntry(entry));
    if (locale in domains) {
      return Result.err(new CLIError({ message: `Duplicate --i18n-domain locale "${locale}".` }));
    }

    domains[locale] = host;
  }

  return Result.ok(domains);
}

/**
 * Fold the flat `--i18n-*` flags into `i18nOptions` per design D1:
 * `--i18n-locales en,fr,de` (first entry is the source locale unless
 * `--i18n-source-locale` is given), `--i18n-routing`, repeatable
 * `--i18n-domain fr=fr.example.com`, and `--i18n-skill/--no-i18n-skill`.
 */
export function resolveI18nCliFlags(input: I18nCliInput): Result<CLIInput, CLIError> {
  const { i18nLocales, i18nSourceLocale, i18nRouting, i18nDomain, i18nSkill, ...rest } = input;
  const hasOptionFlags =
    i18nLocales !== undefined ||
    i18nSourceLocale !== undefined ||
    i18nRouting !== undefined ||
    i18nDomain !== undefined ||
    i18nSkill !== undefined;

  if (!hasOptionFlags) {
    return Result.ok({ ...input });
  }

  if (input.i18n === "none") {
    return Result.err(
      new CLIError({ message: "i18n option flags cannot be combined with --i18n none." }),
    );
  }

  const base = input.i18nOptions ?? I18nOptionsSchema.parse({});
  const locales =
    i18nLocales !== undefined ? parseI18nLocalesInput(i18nLocales) : [...base.locales];
  if (locales.length === 0) {
    return Result.err(
      new CLIError({ message: "At least one locale is required for --i18n-locales." }),
    );
  }

  const sourceLocale =
    i18nSourceLocale ??
    (i18nLocales !== undefined ? (locales[0] ?? base.sourceLocale) : base.sourceLocale);

  let routing = base.routing === undefined ? undefined : { ...base.routing };
  if (i18nRouting !== undefined) {
    routing = {
      strategy: i18nRouting,
      prefixDefaultLocale: base.routing?.prefixDefaultLocale ?? false,
    };
  }
  if (i18nDomain !== undefined) {
    if (routing?.strategy !== "domain") {
      return Result.err(
        new CLIError({
          message:
            "The --i18n-domain flag requires the domain routing strategy (--i18n-routing domain).",
        }),
      );
    }
    const domainsResult = parseI18nDomainEntries(i18nDomain);
    if (domainsResult.isErr()) return Result.err(domainsResult.error);
    routing = { ...routing, domains: domainsResult.value };
  }

  const i18nOptions: I18nOptions = {
    ...base,
    locales,
    sourceLocale,
    translateSkill: i18nSkill ?? base.translateSkill,
  };
  if (routing !== undefined) {
    i18nOptions.routing = routing;
  }

  const validation = validateI18nOptions(i18nOptions);
  if (!validation.isOk) {
    return Result.err(new CLIError({ message: validation.error }));
  }

  const output: CLIInput = { ...rest, i18nOptions };
  if (input.i18n !== undefined) {
    output.i18n = input.i18n;
  }
  return Result.ok(output);
}

/**
 * Programmatic validation for the i18n selection. All compatibility, option and
 * routing rules come from the shared `@better-t-stack/types` i18n module.
 */
export function validateI18nConfig(config: Partial<ProjectConfig>): Result<void, CLIError> {
  const library = config.i18n;
  if (library === undefined || library === "none") return Result.ok(undefined);

  const context = toI18nConfigInput(config);
  const compatibility = validateI18nCompatibility(library, context);
  if (!compatibility.isCompatible) {
    return Result.err(new CLIError({ message: compatibility.reason }));
  }

  const options = config.i18nOptions;
  if (options !== undefined) {
    const optionsValidation = validateI18nOptions(options);
    if (!optionsValidation.isOk) {
      return Result.err(new CLIError({ message: optionsValidation.error }));
    }

    const routingSupport = getI18nRoutingSupport(
      options.routing?.strategy ?? "cookie",
      context,
      library,
    );
    if (!routingSupport.isSupported) {
      return Result.err(new CLIError({ message: routingSupport.reason }));
    }
  }

  return Result.ok(undefined);
}

/** Materialize i18n option defaults and drop orphaned options when i18n is disabled. */
export function normalizeResolvedI18n(config: ProjectConfig): ProjectConfig {
  if (config.i18n === "none") {
    if (config.i18nOptions === undefined) return config;
    const { i18nOptions: _i18nOptions, ...rest } = config;
    return rest;
  }

  return { ...config, i18nOptions: I18nOptionsSchema.parse(config.i18nOptions ?? {}) };
}
