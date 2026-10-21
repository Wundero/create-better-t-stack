import {
  getI18nRoutingSupport,
  I18N_LIBRARIES,
  I18N_LIBRARY_META,
  I18nOptionsSchema,
  validateI18nCompatibility,
  validateI18nOptions,
  type Addons,
  type API,
  type Auth,
  type Backend,
  type Frontend,
  type I18n,
  type I18nConfigInput,
  type I18nRoutingStrategy,
  type Payments,
  type ProjectConfig,
  type Runtime,
} from "../types";
import { parseI18nLocalesInput } from "../utils/i18n-cli";

const ROUTING_STRATEGIES = [
  "cookie",
  "prefix",
  "domain",
] as const satisfies readonly I18nRoutingStrategy[];

const ROUTING_LABELS = {
  cookie: "Cookie",
  prefix: "URL prefix",
  domain: "Domain",
} as const satisfies Record<I18nRoutingStrategy, string>;

const ROUTING_HINTS = {
  cookie: "Detect the locale from the cookie, x-app-locale, or Accept-Language",
  prefix: "Serve each locale under its own URL prefix (/fr/...)",
  domain: "Serve each locale from its own host",
} as const satisfies Record<I18nRoutingStrategy, string>;

export interface I18nLibraryOption {
  value: I18n;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface I18nRoutingOption {
  value: I18nRoutingStrategy;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface I18nPromptResults {
  frontend?: Frontend[];
  backend?: Backend;
  runtime?: Runtime;
  auth?: Auth;
  api?: API;
  payments?: Payments;
  addons?: Addons[];
}

/** Build the shared compatibility input from flags plus the prompt answers collected so far. */
export function buildI18nPromptContext(
  flags: Partial<ProjectConfig>,
  results: I18nPromptResults,
): I18nConfigInput {
  return {
    frontend: results.frontend ?? flags.frontend,
    backend: results.backend ?? flags.backend,
    runtime: results.runtime ?? flags.runtime,
    auth: results.auth ?? flags.auth,
    api: results.api ?? flags.api,
    payments: results.payments ?? flags.payments,
    addons: results.addons ?? flags.addons,
    addonOptions: flags.addonOptions,
  };
}

/** Compatible libraries are selectable; incompatible ones render disabled with the shared reason. */
export function buildI18nLibraryOptions(context: I18nConfigInput): I18nLibraryOption[] {
  const options: I18nLibraryOption[] = I18N_LIBRARIES.map((library) => {
    const meta = I18N_LIBRARY_META[library];
    const label = meta.experimental ? `${meta.label} (experimental)` : meta.label;
    const compatibility = validateI18nCompatibility(library, context);

    if (!compatibility.isCompatible) {
      return { value: library, label, hint: compatibility.reason, disabled: true };
    }

    const hints = [
      meta.experimental ? "Experimental" : undefined,
      ...compatibility.warnings,
    ].filter((value): value is string => value !== undefined);

    return hints.length > 0
      ? { value: library, label, hint: hints.join(" ") }
      : { value: library, label };
  });

  return [...options, { value: "none", label: "None", hint: "English-only project" }];
}

/** Routing strategies the shared module allows are selectable; the rest are disabled with its reason. */
export function buildI18nRoutingOptions(
  context: I18nConfigInput,
  library: I18n,
): I18nRoutingOption[] {
  if (library === "none") return [];

  return ROUTING_STRATEGIES.map((strategy) => {
    const support = getI18nRoutingSupport(strategy, context, library);
    if (!support.isSupported) {
      return {
        value: strategy,
        label: ROUTING_LABELS[strategy],
        hint: support.reason,
        disabled: true,
      };
    }
    return { value: strategy, label: ROUTING_LABELS[strategy], hint: ROUTING_HINTS[strategy] };
  });
}

/** Validate a comma-separated locale list through the shared i18n option rules. */
export function validateI18nLocalesInput(value: string): string | undefined {
  const locales = parseI18nLocalesInput(value);
  if (locales.length === 0) return "Enter at least one locale, for example en,fr,de.";

  const result = validateI18nOptions({
    ...I18nOptionsSchema.parse({}),
    locales,
    sourceLocale: locales[0] ?? "en",
  });
  return result.isOk ? undefined : result.error;
}
