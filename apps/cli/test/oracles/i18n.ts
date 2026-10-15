export type OracleLibrary = "lingui" | "paraglide" | "i18next" | "wuchale";

export type OracleSurface =
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
  | "electrobun-host"
  | "opentui-core"
  | "opentui-react"
  | "opentui-solid"
  | "wxt-vanilla"
  | "wxt-react"
  | "wxt-solid"
  | "wxt-vue"
  | "wxt-svelte";

export type OracleRoutingStrategy = "cookie" | "prefix" | "domain";

export const ORACLE_LIBRARIES = ["lingui", "paraglide", "i18next", "wuchale"] as const;

export const ORACLE_SURFACES = [
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
  "electrobun-host",
  "opentui-core",
  "opentui-react",
  "opentui-solid",
  "wxt-vanilla",
  "wxt-react",
  "wxt-solid",
  "wxt-vue",
  "wxt-svelte",
] as const satisfies readonly OracleSurface[];

export const ORACLE_LABELS = {
  lingui: "Lingui",
  paraglide: "Paraglide",
  i18next: "i18next",
  wuchale: "wuchale",
} as const satisfies Record<OracleLibrary, string>;

const ORACLE_UNSUPPORTED = {
  lingui: ["svelte", "wxt-svelte"],
  paraglide: [],
  i18next: [],
  wuchale: ["nuxt", "native", "wxt-vue"],
} as const satisfies Record<OracleLibrary, readonly OracleSurface[]>;

const ORACLE_PARTIAL = {
  lingui: ["astro"],
  paraglide: [],
  i18next: [],
  wuchale: ["email", "opentui-react", "opentui-solid"],
} as const satisfies Record<OracleLibrary, readonly OracleSurface[]>;

const ORACLE_NOTES = {
  lingui: {
    svelte: "No Svelte template support.",
    "wxt-svelte": "No Svelte template support.",
    astro: "Macros work only in frontmatter and islands, not in `.astro` markup.",
  },
  paraglide: {},
  i18next: {},
  wuchale: {
    nuxt: "No Vue adapter.",
    native: "No Metro integration.",
    "wxt-vue": "No Vue adapter.",
    email: "The server render path is unverified.",
    "opentui-react": "Unverified with the OpenTUI reconciler.",
    "opentui-solid": "Unverified with the OpenTUI reconciler.",
  },
} as const satisfies Record<OracleLibrary, Partial<Record<OracleSurface, string>>>;

function oracleNote(library: OracleLibrary, surface: OracleSurface): string | undefined {
  const notes: Partial<Record<OracleSurface, string>> = ORACLE_NOTES[library];
  return notes[surface];
}

const ROUTABLE_SURFACES = [
  "next",
  "tanstack-start",
  "tanstack-router",
  "react-router",
  "nuxt",
  "svelte",
  "solid",
  "astro",
] as const satisfies readonly OracleSurface[];

const PREFIX_ANY_LIBRARY = [
  "next",
  "tanstack-start",
  "react-router",
  "nuxt",
  "astro",
] as const satisfies readonly OracleSurface[];

const PREFIX_PARAGLIDE_ONLY = [
  "svelte",
  "tanstack-router",
] as const satisfies readonly OracleSurface[];

const STATIC_OR_SPA = [
  "tanstack-router",
  "react-router",
  "astro",
] as const satisfies readonly OracleSurface[];

function includes<T extends string>(values: readonly T[], value: string): boolean {
  return values.some((candidate) => candidate === value);
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export interface OracleCompatibility {
  isCompatible: boolean;
  reason?: string;
  blockingSurfaces: OracleSurface[];
  warnings: string[];
}

export function oracleSupportsSurface(library: OracleLibrary, surface: OracleSurface): boolean {
  return !includes(ORACLE_UNSUPPORTED[library], surface);
}

export function oracleWarnsOnSurface(library: OracleLibrary, surface: OracleSurface): boolean {
  return includes(ORACLE_PARTIAL[library], surface);
}

export function oracleCompatibility(
  library: OracleLibrary,
  surfaces: readonly OracleSurface[],
): OracleCompatibility {
  const blockingSurfaces = surfaces.filter((surface) => !oracleSupportsSurface(library, surface));

  if (blockingSurfaces.length > 0) {
    const note = blockingSurfaces
      .map((surface) => oracleNote(library, surface))
      .find((value) => value !== undefined);
    return {
      isCompatible: false,
      reason: `${ORACLE_LABELS[library]} doesn't support ${blockingSurfaces.join(", ")}: ${note ?? "unsupported on this surface"}`,
      blockingSurfaces,
      warnings: [],
    };
  }

  const warnings = unique(
    surfaces
      .filter((surface) => oracleWarnsOnSurface(library, surface))
      .map((surface) => oracleNote(library, surface))
      .filter((value): value is string => value !== undefined),
  );

  return { isCompatible: true, blockingSurfaces: [], warnings };
}

function oracleSupportsPrefix(surface: OracleSurface, library: OracleLibrary): boolean {
  if (includes(PREFIX_ANY_LIBRARY, surface)) return true;
  if (includes(PREFIX_PARAGLIDE_ONLY, surface)) return library === "paraglide";
  return false;
}

export interface OracleRoutingSupport {
  isSupported: boolean;
  reason?: string;
}

export function oracleRoutingSupport(
  strategy: OracleRoutingStrategy,
  library: OracleLibrary,
  surfaces: readonly OracleSurface[],
): OracleRoutingSupport {
  if (strategy === "cookie") return { isSupported: true };

  const routable = surfaces.filter((surface) => includes(ROUTABLE_SURFACES, surface));
  const prefixBlocked = routable.filter((surface) => !oracleSupportsPrefix(surface, library));

  if (strategy === "prefix") {
    if (prefixBlocked.length > 0) {
      return {
        isSupported: false,
        reason: `${ORACLE_LABELS[library]} does not support prefix routing on ${prefixBlocked.join(", ")}.`,
      };
    }
    return { isSupported: true };
  }

  const domainBlocked = unique([
    ...prefixBlocked,
    ...routable.filter((surface) => includes(STATIC_OR_SPA, surface)),
  ]);

  if (domainBlocked.length > 0) {
    return {
      isSupported: false,
      reason: `Domain routing needs a server-rendered surface; not supported on ${domainBlocked.join(", ")}.`,
    };
  }
  return { isSupported: true };
}

export interface I18nOracleCase {
  library: OracleLibrary;
  surface: OracleSurface;
  routing: OracleRoutingStrategy;
  expectedCompatible: boolean;
  expectedRouting: boolean;
}

export function createI18nOracleCases(): I18nOracleCase[] {
  const cases: I18nOracleCase[] = [];
  for (const library of ORACLE_LIBRARIES) {
    for (const surface of ORACLE_SURFACES) {
      for (const routing of ["cookie", "prefix", "domain"] as const) {
        cases.push({
          library,
          surface,
          routing,
          expectedCompatible: oracleSupportsSurface(library, surface),
          expectedRouting: oracleRoutingSupport(routing, library, [surface]).isSupported,
        });
      }
    }
  }
  return cases;
}

export function formatOracleCase(testCase: I18nOracleCase): string {
  return `${testCase.library}/${testCase.surface}/${testCase.routing}`;
}
