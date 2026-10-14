import { I18N_LIBRARY_VALUES } from "./schemas";
import type {
  AddonOptions,
  Addons,
  API,
  Auth,
  Backend,
  Frontend,
  I18nOptions,
  Payments,
  Runtime,
} from "./types";

export const I18N_LIBRARIES = I18N_LIBRARY_VALUES;
export type I18nLibrary = (typeof I18N_LIBRARY_VALUES)[number];

export type I18nRoutingStrategy = "cookie" | "prefix" | "domain";

export type I18nSurface =
  | "next"
  | "tanstack-start"
  | "tanstack-router"
  | "react-router"
  | "nuxt"
  | "svelte"
  | "solid"
  | "astro"
  | "native"
  | "server"
  | "email"
  | "tauri-host"
  | "electrobun-host"
  | "opentui-core"
  | "opentui-react"
  | "opentui-solid"
  | "wxt-vanilla"
  | "wxt-react"
  | "wxt-solid"
  | "wxt-vue"
  | "wxt-svelte";

export const I18N_SURFACES = [
  "next",
  "tanstack-start",
  "tanstack-router",
  "react-router",
  "nuxt",
  "svelte",
  "solid",
  "astro",
  "native",
  "server",
  "email",
  "tauri-host",
  "electrobun-host",
  "opentui-core",
  "opentui-react",
  "opentui-solid",
  "wxt-vanilla",
  "wxt-react",
  "wxt-solid",
  "wxt-vue",
  "wxt-svelte",
] as const satisfies readonly I18nSurface[];

export interface I18nConfigInput {
  frontend?: readonly Frontend[];
  backend?: Backend;
  runtime?: Runtime;
  auth?: Auth;
  api?: API;
  payments?: Payments;
  addons?: readonly Addons[];
  addonOptions?: AddonOptions;
  /** Present only once the `wt/email-support` branch is merged; absent in core. */
  emailRenderer?: string;
  /** Present only once the `wt/shadcn-theme-config` branch is merged; absent in core. */
  shadcn?: { readonly rtl?: boolean };
  /** Present only once the `wt/payment-providers` branch is merged; absent in core. */
  paymentCheckoutLocale?: string;
}

const NATIVE_FRONTENDS = [
  "native-bare",
  "native-uniwind",
  "native-unistyles",
] as const satisfies readonly Frontend[];

const SERVER_BACKENDS = [
  "hono",
  "express",
  "fastify",
  "elysia",
  "nitro",
] as const satisfies readonly Backend[];

const OPENTUI_DEFAULT_TEMPLATE = "core";
const WXT_DEFAULT_TEMPLATE = "react";

type TuiTemplate = NonNullable<AddonOptions["opentui"]>["template"];
type WxtTemplate = NonNullable<AddonOptions["wxt"]>["template"];

export function getI18nSurfaces(config: I18nConfigInput): I18nSurface[] {
  const frontends = config.frontend ?? [];
  const addons = config.addons ?? [];
  const backend = config.backend;
  const surfaces: I18nSurface[] = [];

  if (frontends.includes("next")) surfaces.push("next");
  if (frontends.includes("tanstack-start")) surfaces.push("tanstack-start");
  if (frontends.includes("tanstack-router")) surfaces.push("tanstack-router");
  if (frontends.includes("react-router")) surfaces.push("react-router");
  if (frontends.includes("nuxt")) surfaces.push("nuxt");
  if (frontends.includes("svelte")) surfaces.push("svelte");
  if (frontends.includes("solid")) surfaces.push("solid");
  if (frontends.includes("astro")) surfaces.push("astro");
  if (frontends.some((frontend) => NATIVE_FRONTENDS.some((value) => value === frontend))) {
    surfaces.push("native");
  }
  if (backend && SERVER_BACKENDS.some((value) => value === backend)) {
    surfaces.push("server");
  }
  if (config.emailRenderer === "react-email") surfaces.push("email");
  if (addons.includes("tauri")) surfaces.push("tauri-host");
  if (addons.includes("electrobun")) surfaces.push("electrobun-host");

  if (addons.includes("opentui")) {
    const template: TuiTemplate =
      config.addonOptions?.opentui?.template ?? OPENTUI_DEFAULT_TEMPLATE;
    surfaces.push(`opentui-${template}`);
  }
  if (addons.includes("wxt")) {
    const template: WxtTemplate = config.addonOptions?.wxt?.template ?? WXT_DEFAULT_TEMPLATE;
    surfaces.push(`wxt-${template}`);
  }

  return surfaces;
}

export type I18nSupportLevel = "native" | "adapter" | "partial" | "unsupported";

export interface I18nSupportCell {
  readonly level: I18nSupportLevel;
  readonly note?: string;
}

export type I18nSupportMatrix = Record<I18nLibrary, Record<I18nSurface, I18nSupportCell>>;

export const I18N_SUPPORT = {
  lingui: {
    next: { level: "native", note: "Uses the SWC plugin and React Server Components." },
    "tanstack-start": { level: "adapter", note: "Uses the Vite plugin with React." },
    "tanstack-router": { level: "adapter", note: "Uses the Vite plugin with React." },
    "react-router": { level: "adapter", note: "Uses the Vite plugin with React." },
    nuxt: { level: "adapter", note: "Uses createVueExtractor with a composable." },
    svelte: { level: "unsupported", note: "No Svelte template support." },
    solid: { level: "native" },
    astro: {
      level: "partial",
      note: "Macros work only in frontmatter and islands, not in `.astro` markup.",
    },
    native: { level: "native", note: "Uses @lingui/metro-transformer." },
    server: { level: "adapter", note: "Uses a Bun preload or a bundler macro plugin." },
    email: { level: "native" },
    "tauri-host": { level: "adapter", note: "Rust crate generated from the shared catalogs." },
    "electrobun-host": { level: "adapter", note: "Uses a Bun preload." },
    "opentui-core": { level: "adapter", note: "Uses a Bun preload." },
    "opentui-react": { level: "adapter", note: "Uses a Bun preload." },
    "opentui-solid": { level: "adapter", note: "Uses a Bun preload." },
    "wxt-vanilla": { level: "adapter" },
    "wxt-react": { level: "native" },
    "wxt-solid": { level: "native" },
    "wxt-vue": { level: "adapter" },
    "wxt-svelte": { level: "unsupported", note: "No Svelte template support." },
  },
  paraglide: {
    next: { level: "native" },
    "tanstack-start": { level: "native" },
    "tanstack-router": { level: "native" },
    "react-router": { level: "native" },
    nuxt: { level: "adapter" },
    svelte: { level: "native" },
    solid: { level: "native" },
    astro: { level: "native" },
    native: { level: "adapter", note: "Compiled through the CLI." },
    server: { level: "native" },
    email: { level: "native" },
    "tauri-host": { level: "adapter", note: "Typed Rust functions generated from the catalogs." },
    "electrobun-host": { level: "native" },
    "opentui-core": { level: "native" },
    "opentui-react": { level: "native" },
    "opentui-solid": { level: "native" },
    "wxt-vanilla": { level: "native" },
    "wxt-react": { level: "native" },
    "wxt-solid": { level: "native" },
    "wxt-vue": { level: "adapter" },
    "wxt-svelte": { level: "native" },
  },
  i18next: {
    next: { level: "adapter" },
    "tanstack-start": { level: "adapter" },
    "tanstack-router": { level: "adapter" },
    "react-router": { level: "adapter" },
    nuxt: { level: "adapter", note: "Uses i18next-vue." },
    svelte: { level: "adapter", note: "Uses a shipped store." },
    solid: { level: "adapter", note: "Uses a shipped primitive." },
    astro: { level: "adapter" },
    native: { level: "native" },
    server: { level: "native" },
    email: { level: "native" },
    "tauri-host": { level: "adapter", note: "Rust crate generated from the shared catalogs." },
    "electrobun-host": { level: "native" },
    "opentui-core": { level: "native" },
    "opentui-react": { level: "native" },
    "opentui-solid": { level: "adapter" },
    "wxt-vanilla": { level: "native" },
    "wxt-react": { level: "native" },
    "wxt-solid": { level: "adapter" },
    "wxt-vue": { level: "adapter" },
    "wxt-svelte": { level: "adapter" },
  },
  wuchale: {
    next: { level: "native" },
    "tanstack-start": { level: "adapter" },
    "tanstack-router": { level: "adapter" },
    "react-router": { level: "adapter" },
    nuxt: { level: "unsupported", note: "No Vue adapter." },
    svelte: { level: "native" },
    solid: { level: "native" },
    astro: { level: "native" },
    native: { level: "unsupported", note: "No Metro integration." },
    server: { level: "adapter" },
    email: { level: "partial", note: "The server render path is unverified." },
    "tauri-host": {
      level: "unsupported",
      note: "Implicit extraction has no Rust counterpart.",
    },
    "electrobun-host": { level: "adapter" },
    "opentui-core": { level: "adapter" },
    "opentui-react": { level: "partial", note: "Unverified with the OpenTUI reconciler." },
    "opentui-solid": { level: "partial", note: "Unverified with the OpenTUI reconciler." },
    "wxt-vanilla": { level: "adapter" },
    "wxt-react": { level: "native" },
    "wxt-solid": { level: "native" },
    "wxt-vue": { level: "unsupported", note: "No Vue adapter." },
    "wxt-svelte": { level: "native" },
  },
} as const satisfies I18nSupportMatrix;

export type I18nKeyStyle = "source-text" | "id" | "implicit";
export type I18nCatalogFormat = "po" | "inlang-json" | "i18next-json";
export type I18nRustMacro = "source-text" | "function";

export interface I18nLibraryMeta {
  readonly label: string;
  readonly keyStyle: I18nKeyStyle;
  readonly experimental: boolean;
  readonly catalogFormat: I18nCatalogFormat;
  readonly rustMacro: I18nRustMacro;
}

export const I18N_LIBRARY_META = {
  lingui: {
    label: "Lingui",
    keyStyle: "source-text",
    experimental: false,
    catalogFormat: "po",
    rustMacro: "source-text",
  },
  paraglide: {
    label: "Paraglide",
    keyStyle: "id",
    experimental: false,
    catalogFormat: "inlang-json",
    rustMacro: "function",
  },
  i18next: {
    label: "i18next",
    keyStyle: "source-text",
    experimental: false,
    catalogFormat: "i18next-json",
    rustMacro: "source-text",
  },
  wuchale: {
    label: "wuchale",
    keyStyle: "implicit",
    experimental: true,
    catalogFormat: "po",
    rustMacro: "function",
  },
} as const satisfies Record<I18nLibrary, I18nLibraryMeta>;

export type I18nCompatibility =
  | { readonly isCompatible: true; readonly warnings: readonly string[] }
  | {
      readonly isCompatible: false;
      readonly reason: string;
      readonly blockingSurfaces: readonly I18nSurface[];
    };

export function validateI18nCompatibility(
  library: I18nLibrary,
  config: I18nConfigInput,
): I18nCompatibility {
  const surfaces = getI18nSurfaces(config);
  const support: Record<I18nSurface, I18nSupportCell> = I18N_SUPPORT[library];
  const blockingSurfaces = surfaces.filter((surface) => support[surface].level === "unsupported");

  if (blockingSurfaces.length > 0) {
    const note = blockingSurfaces
      .map((surface) => support[surface].note)
      .find((value): value is string => value !== undefined);
    return {
      isCompatible: false,
      reason: `${I18N_LIBRARY_META[library].label} doesn't support ${blockingSurfaces.join(", ")}: ${note ?? "unsupported on this surface"}`,
      blockingSurfaces,
    };
  }

  const warnings = [
    ...new Set(
      surfaces
        .filter((surface) => support[surface].level === "partial")
        .map((surface) => support[surface].note)
        .filter((value): value is string => value !== undefined),
    ),
  ];

  return { isCompatible: true, warnings };
}

export function getCompatibleI18nLibraries(config: I18nConfigInput): I18nLibrary[] {
  return I18N_LIBRARIES.filter(
    (library) => validateI18nCompatibility(library, config).isCompatible,
  );
}

const DEFAULT_LIBRARY_ORDER = [
  "lingui",
  "paraglide",
  "i18next",
] as const satisfies readonly I18nLibrary[];

export type DefaultI18nLibrary = (typeof DEFAULT_LIBRARY_ORDER)[number] | "none";

export function getDefaultI18nLibrary(config: I18nConfigInput): DefaultI18nLibrary {
  return (
    DEFAULT_LIBRARY_ORDER.find(
      (library) => validateI18nCompatibility(library, config).isCompatible,
    ) ?? "none"
  );
}

export type I18nOptionsValidation =
  | { readonly isOk: true }
  | { readonly isOk: false; readonly error: string };

function canonicalizeLocale(tag: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

function invalidTag(field: string, tag: string): I18nOptionsValidation {
  return { isOk: false, error: `"${tag}" is not a valid BCP-47 locale for \`${field}\`.` };
}

function nonCanonicalTag(field: string, tag: string, canonical: string): I18nOptionsValidation {
  return {
    isOk: false,
    error: `\`${field}\` entry "${tag}" is not canonical; use "${canonical}".`,
  };
}

export function validateI18nOptions(options: I18nOptions): I18nOptionsValidation {
  const { locales } = options;

  if (locales.length === 0) {
    return { isOk: false, error: "At least one locale is required." };
  }

  for (const locale of locales) {
    const canonical = canonicalizeLocale(locale);
    if (canonical === undefined) return invalidTag("locales", locale);
    if (canonical !== locale) return nonCanonicalTag("locales", locale, canonical);
  }

  if (new Set(locales).size !== locales.length) {
    return { isOk: false, error: "`locales` must not contain duplicates." };
  }

  const sourceLocale = canonicalizeLocale(options.sourceLocale);
  if (sourceLocale === undefined) return invalidTag("sourceLocale", options.sourceLocale);
  if (sourceLocale !== options.sourceLocale) {
    return nonCanonicalTag("sourceLocale", options.sourceLocale, sourceLocale);
  }

  if (!locales.includes(options.sourceLocale)) {
    return {
      isOk: false,
      error: `The source locale "${options.sourceLocale}" must be included in \`locales\`.`,
    };
  }

  const { domains } = options.routing ?? {};
  if (domains) {
    const hosts = Object.values(domains);
    if (new Set(hosts).size !== hosts.length) {
      return { isOk: false, error: "Each domain host must be unique." };
    }
    for (const locale of Object.keys(domains)) {
      if (!locales.includes(locale)) {
        return {
          isOk: false,
          error: `Domain mapping key "${locale}" must be one of the configured locales.`,
        };
      }
    }
  }

  return { isOk: true };
}

export type I18nRoutingSupport =
  | { readonly isSupported: true }
  | { readonly isSupported: false; readonly reason: string };

const ROUTABLE_FRONTEND_SURFACES = [
  "next",
  "tanstack-start",
  "tanstack-router",
  "react-router",
  "nuxt",
  "svelte",
  "solid",
  "astro",
] as const satisfies readonly I18nSurface[];

const PREFIX_ANY_LIBRARY_SURFACES = [
  "next",
  "tanstack-start",
  "react-router",
  "nuxt",
  "astro",
] as const satisfies readonly I18nSurface[];

const PREFIX_PARAGLIDE_ONLY_SURFACES = [
  "svelte",
  "tanstack-router",
] as const satisfies readonly I18nSurface[];

const STATIC_OR_SPA_SURFACES = [
  "tanstack-router",
  "react-router",
  "astro",
] as const satisfies readonly I18nSurface[];

function supportsPrefixRouting(surface: I18nSurface, library: I18nLibrary): boolean {
  if (PREFIX_ANY_LIBRARY_SURFACES.some((value) => value === surface)) return true;
  if (PREFIX_PARAGLIDE_ONLY_SURFACES.some((value) => value === surface)) {
    return library === "paraglide";
  }
  return false;
}

export function getI18nRoutingSupport(
  strategy: I18nRoutingStrategy,
  config: I18nConfigInput,
  library: I18nLibrary,
): I18nRoutingSupport {
  if (strategy === "cookie") return { isSupported: true };

  const routable = getI18nSurfaces(config).filter((surface) =>
    ROUTABLE_FRONTEND_SURFACES.some((value) => value === surface),
  );

  const prefixBlocked = routable.filter((surface) => !supportsPrefixRouting(surface, library));

  if (strategy === "prefix") {
    if (prefixBlocked.length > 0) {
      return {
        isSupported: false,
        reason: `${I18N_LIBRARY_META[library].label} does not support prefix routing on ${prefixBlocked.join(", ")}.`,
      };
    }
    return { isSupported: true };
  }

  const domainBlocked = [
    ...new Set([
      ...prefixBlocked,
      ...routable.filter((surface) => STATIC_OR_SPA_SURFACES.some((value) => value === surface)),
    ]),
  ];

  if (domainBlocked.length > 0) {
    return {
      isSupported: false,
      reason: `Domain routing needs a server-rendered surface; not supported on ${domainBlocked.join(", ")}.`,
    };
  }
  return { isSupported: true };
}

export type I18nIntegrationKind = "builtin-localization" | "framework" | "tooling";

export type I18nIntegrationId =
  | "better-auth-i18n"
  | "clerk-localizations"
  | "zod-locales"
  | "nuxt-ui-locale"
  | "turnstile-language"
  | "payments-checkout-locale"
  | "starlight-i18n"
  | "fumadocs-i18n"
  | "shadcn-direction"
  | "react-email-locale"
  | "pwa-manifest-lang"
  | "nuxt-i18n-module"
  | "astro-i18n-routing"
  | "wxt-i18n"
  | "expo-localization"
  | "lingui-bun-preload"
  | "server-locale-middleware"
  | "tauri-rust-i18n"
  | "lingui-skills";

export interface I18nIntegrationContext {
  readonly config: I18nConfigInput;
  readonly surfaces: readonly I18nSurface[];
  readonly library: I18nLibrary;
}

export interface I18nIntegration {
  readonly id: I18nIntegrationId;
  readonly label: string;
  readonly kind: I18nIntegrationKind;
  readonly when: (context: I18nIntegrationContext) => boolean;
  readonly dependsOnBranch?: string;
}

function hasAddon(config: I18nConfigInput, addon: string): boolean {
  const addons: readonly string[] = config.addons ?? [];
  return addons.includes(addon);
}

function hasSurface(surfaces: readonly I18nSurface[], surface: I18nSurface): boolean {
  return surfaces.includes(surface);
}

export const I18N_INTEGRATIONS = [
  {
    id: "better-auth-i18n",
    label: "Better Auth error messages",
    kind: "builtin-localization",
    when: ({ config }) => config.auth === "better-auth",
  },
  {
    id: "clerk-localizations",
    label: "Clerk localization",
    kind: "builtin-localization",
    when: ({ config }) => config.auth === "clerk",
  },
  {
    id: "zod-locales",
    label: "Zod error messages",
    kind: "builtin-localization",
    when: ({ config }) => (config.auth ?? "none") !== "none" || (config.api ?? "none") !== "none",
  },
  {
    id: "nuxt-ui-locale",
    label: "Nuxt UI locale",
    kind: "builtin-localization",
    when: ({ surfaces }) => hasSurface(surfaces, "nuxt"),
  },
  {
    id: "turnstile-language",
    label: "Turnstile language",
    kind: "builtin-localization",
    when: ({ config }) => hasAddon(config, "turnstile"),
    dependsOnBranch: "wt/turnstile-addon",
  },
  {
    id: "payments-checkout-locale",
    label: "Payment checkout locale",
    kind: "builtin-localization",
    when: ({ config }) => config.paymentCheckoutLocale !== undefined,
    dependsOnBranch: "wt/payment-providers",
  },
  {
    id: "starlight-i18n",
    label: "Starlight i18n",
    kind: "builtin-localization",
    when: ({ config }) => hasAddon(config, "starlight"),
  },
  {
    id: "fumadocs-i18n",
    label: "Fumadocs i18n",
    kind: "builtin-localization",
    when: ({ config }) => hasAddon(config, "fumadocs"),
  },
  {
    id: "shadcn-direction",
    label: "shadcn direction",
    kind: "builtin-localization",
    when: ({ config }) => config.shadcn !== undefined,
    dependsOnBranch: "wt/shadcn-theme-config",
  },
  {
    id: "react-email-locale",
    label: "React Email locale",
    kind: "builtin-localization",
    when: ({ surfaces }) => hasSurface(surfaces, "email"),
    dependsOnBranch: "wt/email-support",
  },
  {
    id: "pwa-manifest-lang",
    label: "PWA manifest language",
    kind: "builtin-localization",
    when: ({ config }) => hasAddon(config, "pwa"),
  },
  {
    id: "nuxt-i18n-module",
    label: "@nuxtjs/i18n module",
    kind: "framework",
    when: ({ surfaces }) => hasSurface(surfaces, "nuxt"),
  },
  {
    id: "astro-i18n-routing",
    label: "Astro i18n routing",
    kind: "framework",
    when: ({ surfaces }) => hasSurface(surfaces, "astro"),
  },
  {
    id: "wxt-i18n",
    label: "@wxt-dev/i18n",
    kind: "framework",
    when: ({ surfaces }) => surfaces.some((surface) => surface.startsWith("wxt-")),
  },
  {
    id: "expo-localization",
    label: "Expo localization",
    kind: "framework",
    when: ({ surfaces }) => hasSurface(surfaces, "native"),
  },
  {
    id: "lingui-bun-preload",
    label: "Lingui Bun preload",
    kind: "tooling",
    when: ({ config, surfaces, library }) =>
      library === "lingui" &&
      (hasSurface(surfaces, "electrobun-host") ||
        surfaces.some((surface) => surface.startsWith("opentui-")) ||
        (hasSurface(surfaces, "server") && config.runtime === "bun")),
  },
  {
    id: "server-locale-middleware",
    label: "Server locale middleware",
    kind: "framework",
    when: ({ surfaces }) => hasSurface(surfaces, "server"),
  },
  {
    id: "tauri-rust-i18n",
    label: "Tauri Rust i18n",
    kind: "tooling",
    when: ({ surfaces }) => hasSurface(surfaces, "tauri-host"),
  },
  {
    id: "lingui-skills",
    label: "Lingui skills",
    kind: "tooling",
    when: ({ config, library }) => library === "lingui" && hasAddon(config, "skills"),
  },
] as const satisfies readonly I18nIntegration[];

export function getI18nIntegrations(
  config: I18nConfigInput,
  library: I18nLibrary,
): I18nIntegration[] {
  const context: I18nIntegrationContext = {
    config,
    surfaces: getI18nSurfaces(config),
    library,
  };
  return I18N_INTEGRATIONS.filter((integration) => integration.when(context));
}
