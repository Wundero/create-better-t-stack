import { describe, expect, test } from "bun:test";

import {
  getI18nRoutingSupport,
  getI18nSurfaces,
  validateI18nCompatibility,
  type I18nConfigInput,
} from "@better-t-stack/types";

import {
  ORACLE_LIBRARIES,
  ORACLE_SURFACES,
  oracleCompatibility,
  oracleRoutingSupport,
  type OracleSurface,
} from "../../cli/test/oracles/i18n";
import { DEFAULT_I18N_OPTIONS, DEFAULT_STACK, type StackState } from "../src/lib/constant";
import { resolveStackCompatibility } from "../src/lib/stack-compatibility";
import { getI18nConfigFromStack } from "../src/lib/stack-i18n";
import { StackStateSchema } from "../src/lib/stack-schema";
import { loadStackParams } from "../src/lib/stack-url-state";
import { generateStackCommand, generateStackUrlFromState } from "../src/lib/stack-utils";
import { getDisabledReason } from "../src/lib/stack-validation";

type ResolvedI18nOptions = NonNullable<StackState["i18nOptions"]>;
type I18nOptionsOverride = Omit<Partial<ResolvedI18nOptions>, "routing"> & {
  routing?: Partial<NonNullable<ResolvedI18nOptions["routing"]>>;
};

const SURFACE_CONFIG = {
  next: { frontend: ["next"] },
  "tanstack-start": { frontend: ["tanstack-start"] },
  "tanstack-router": { frontend: ["tanstack-router"] },
  "react-router": { frontend: ["react-router"] },
  nuxt: { frontend: ["nuxt"] },
  svelte: { frontend: ["svelte"] },
  solid: { frontend: ["solid"] },
  astro: { frontend: ["astro"] },
  native: { frontend: ["native-bare"] },
  server: { backend: "hono" },
  email: { emailRenderer: "react-email" },
  "tauri-host": { addons: ["tauri"] },
  "electrobun-host": { addons: ["electrobun"] },
  "opentui-core": { addons: ["opentui"], addonOptions: { opentui: { template: "core" } } },
  "opentui-react": { addons: ["opentui"], addonOptions: { opentui: { template: "react" } } },
  "opentui-solid": { addons: ["opentui"], addonOptions: { opentui: { template: "solid" } } },
  "wxt-vanilla": { addons: ["wxt"], addonOptions: { wxt: { template: "vanilla" } } },
  "wxt-react": { addons: ["wxt"], addonOptions: { wxt: { template: "react" } } },
  "wxt-solid": { addons: ["wxt"], addonOptions: { wxt: { template: "solid" } } },
  "wxt-vue": { addons: ["wxt"], addonOptions: { wxt: { template: "vue" } } },
  "wxt-svelte": { addons: ["wxt"], addonOptions: { wxt: { template: "svelte" } } },
} satisfies Record<OracleSurface, I18nConfigInput>;

const WEB_FRONTENDS = [
  "next",
  "tanstack-start",
  "tanstack-router",
  "react-router",
  "nuxt",
  "svelte",
  "solid",
  "astro",
] as const;

function i18nOptions(overrides: I18nOptionsOverride = {}): ResolvedI18nOptions {
  return {
    ...DEFAULT_I18N_OPTIONS,
    ...overrides,
    routing: { ...DEFAULT_I18N_OPTIONS.routing, ...overrides.routing },
  };
}

function stack(overrides: Partial<StackState>): StackState {
  return StackStateSchema.parse({ ...DEFAULT_STACK, ...overrides });
}

const REPRESENTATIVE_STACKS: StackState[] = [
  ...WEB_FRONTENDS.map((frontend) => stack({ webFrontend: [frontend] })),
  stack({ webFrontend: ["none"], nativeFrontend: ["native-bare"] }),
  stack({ webFrontend: ["none"], nativeFrontend: ["native-uniwind"] }),
  stack({ webFrontend: ["next"], addons: ["tauri", "turborepo"] }),
  stack({ webFrontend: ["next"], addons: ["electrobun", "turborepo"] }),
  stack({ webFrontend: ["next"], addons: ["opentui", "turborepo"] }),
  stack({ webFrontend: ["next"], addons: ["wxt", "turborepo"] }),
  stack({ webFrontend: ["nuxt"], backend: "self-nuxt", runtime: "none" }),
  stack({ webFrontend: ["next"], backend: "self-next", runtime: "none", api: "orpc" }),
  stack({ webFrontend: ["svelte"], runtime: "bun" }),
];

describe("web stack builder i18n parity with the compatibility oracle", () => {
  test("every surface's compatible libraries match the oracle", () => {
    for (const surface of ORACLE_SURFACES) {
      const config = SURFACE_CONFIG[surface];
      const surfaces = getI18nSurfaces(config);
      expect(surfaces).toEqual([surface]);

      for (const library of ORACLE_LIBRARIES) {
        const compatibility = validateI18nCompatibility(library, config);
        const oracle = oracleCompatibility(library, surfaces);

        expect(compatibility.isCompatible).toBe(oracle.isCompatible);
        if (!compatibility.isCompatible) {
          expect(oracle.reason ?? null).toBe(compatibility.reason);
        }
      }
    }
  });

  test("every surface's routing support matches the oracle", () => {
    for (const surface of ORACLE_SURFACES) {
      const config = SURFACE_CONFIG[surface];
      const surfaces = getI18nSurfaces(config);

      for (const library of ORACLE_LIBRARIES) {
        for (const strategy of ["cookie", "prefix", "domain"] as const) {
          const web = getI18nRoutingSupport(strategy, config, library);
          const oracle = oracleRoutingSupport(strategy, library, surfaces);

          expect(web.isSupported).toBe(oracle.isSupported);
          if (!web.isSupported) {
            expect(oracle.reason ?? null).toBe(web.reason);
          }
        }
      }
    }
  });

  test("the builder's disabled i18n set equals the oracle's rejected set", () => {
    for (const rawStack of REPRESENTATIVE_STACKS) {
      const resolved = resolveStackCompatibility(rawStack).stack;
      const surfaces = getI18nSurfaces(getI18nConfigFromStack(resolved));

      for (const library of ORACLE_LIBRARIES) {
        const disabledReason = getDisabledReason(resolved, "i18n", library);
        const oracle = oracleCompatibility(library, surfaces);

        expect(Boolean(disabledReason)).toBe(!oracle.isCompatible);
        if (!oracle.isCompatible) {
          expect(oracle.reason ?? null).toBe(disabledReason);
        }
      }
    }
  });

  test("auto-fixes an unsupported library or routing choice to a compatible state", () => {
    const resolved = resolveStackCompatibility(
      stack({
        webFrontend: ["svelte"],
        i18n: "lingui",
        i18nOptions: i18nOptions({ locales: ["en", "fr"], routing: { strategy: "domain" } }),
      }),
    ).stack;

    expect(resolved.i18n).toBe("none");
    expect(resolved.i18nOptions).toBeUndefined();

    const routed = resolveStackCompatibility(
      stack({
        webFrontend: ["tanstack-router"],
        i18n: "i18next",
        i18nOptions: i18nOptions({ locales: ["en", "fr"], routing: { strategy: "domain" } }),
      }),
    ).stack;

    expect(routed.i18n).toBe("i18next");
    expect(routed.i18nOptions?.routing?.strategy).toBe("cookie");
  });
});

describe("web stack builder i18n URL round-trip", () => {
  test("preserves the library, locales, source and prefix routing through the URL", async () => {
    const original = resolveStackCompatibility(
      stack({
        webFrontend: ["next"],
        i18n: "lingui",
        i18nOptions: i18nOptions({
          sourceLocale: "es",
          locales: ["en", "es", "fr"],
          routing: { strategy: "prefix", prefixDefaultLocale: true },
        }),
      }),
    ).stack;

    const shared = await loadStackParams(
      Promise.resolve(new URL(generateStackUrlFromState(original))),
    );

    expect(shared.i18n).toBe("lingui");
    expect(shared.i18nOptions?.sourceLocale).toBe("es");
    expect(shared.i18nOptions?.locales).toEqual(["en", "es", "fr"]);
    expect(shared.i18nOptions?.routing?.strategy).toBe("prefix");
    expect(generateStackCommand(shared)).toBe(generateStackCommand(original));
  });

  test("preserves a domain map through the URL", async () => {
    const original = resolveStackCompatibility(
      stack({
        webFrontend: ["next"],
        i18n: "paraglide",
        i18nOptions: i18nOptions({
          locales: ["en", "fr", "de"],
          routing: { strategy: "domain", domains: { fr: "fr.example.com", de: "de.example.com" } },
        }),
      }),
    ).stack;

    expect(original.i18nOptions?.routing?.strategy).toBe("domain");

    const shared = await loadStackParams(
      Promise.resolve(new URL(generateStackUrlFromState(original))),
    );

    expect(shared.i18nOptions?.routing?.strategy).toBe("domain");
    expect(shared.i18nOptions?.routing?.domains).toEqual({
      fr: "fr.example.com",
      de: "de.example.com",
    });
    expect(generateStackCommand(shared)).toBe(generateStackCommand(original));
  });
});
