import { describe, expect, test } from "bun:test";

import {
  getCompatibleI18nLibraries,
  getDefaultI18nLibrary,
  getI18nIntegrations,
  getI18nRoutingSupport,
  getI18nSurfaces,
  getTextDirection,
  hasRtlLocale,
  type I18nConfigInput,
  I18N_INTEGRATIONS,
  I18N_LIBRARIES,
  I18N_LIBRARY_META,
  I18N_SUPPORT,
  I18N_SURFACES,
  type I18nLibrary,
  type I18nSupportLevel,
  usesShadcnLocaleDirection,
  validateI18nCompatibility,
  validateI18nOptions,
} from "../src/i18n";
import { getPaymentProvider, PAYMENT_PROVIDER_IDS } from "../src/payment-providers";
import { I18nOptionsSchema } from "../src/schemas";

const SUPPORT_LEVELS: readonly I18nSupportLevel[] = ["native", "adapter", "partial", "unsupported"];

function defaultOptions() {
  return I18nOptionsSchema.parse({});
}

describe("getI18nSurfaces", () => {
  test("derives the web surface from a single web frontend", () => {
    expect(getI18nSurfaces({ frontend: ["next"] })).toEqual(["next"]);
  });

  test("treats every native-* frontend as the single native surface", () => {
    expect(getI18nSurfaces({ frontend: ["native-uniwind"] })).toEqual(["native"]);
    expect(getI18nSurfaces({ frontend: ["native-bare"] })).toEqual(["native"]);
  });

  test("adds the server surface for server backends only", () => {
    expect(getI18nSurfaces({ backend: "hono" })).toEqual(["server"]);
    expect(getI18nSurfaces({ backend: "nitro" })).toEqual(["server"]);
    expect(getI18nSurfaces({ backend: "self", frontend: ["nuxt"] })).toEqual(["nuxt"]);
    expect(getI18nSurfaces({ backend: "convex" })).toEqual([]);
    expect(getI18nSurfaces({ backend: "none" })).toEqual([]);
  });

  test("does not derive the email surface in core", () => {
    expect(getI18nSurfaces({ frontend: ["next"] })).not.toContain("email");
  });

  test("derives the email surface from the react-email renderer", () => {
    expect(getI18nSurfaces({ emailRenderer: "react-email" })).toEqual(["email"]);
    expect(getI18nSurfaces({ emailRenderer: "none" })).toEqual([]);
    expect(getI18nSurfaces({ frontend: ["next"], emailRenderer: "react-email" })).toEqual([
      "next",
      "email",
    ]);
  });

  test("derives the desktop host surface from the electrobun addon", () => {
    expect(getI18nSurfaces({ addons: ["electrobun"] })).toEqual(["electrobun-host"]);
  });

  test("derives no i18n surface from the tauri addon", () => {
    expect(getI18nSurfaces({ addons: ["tauri"] })).toEqual([]);
  });

  test("uses the CLI default OpenTUI template when none is configured", () => {
    expect(getI18nSurfaces({ addons: ["opentui"] })).toEqual(["opentui-core"]);
    expect(
      getI18nSurfaces({ addons: ["opentui"], addonOptions: { opentui: { template: "solid" } } }),
    ).toEqual(["opentui-solid"]);
  });

  test("uses the CLI default WXT template when none is configured", () => {
    expect(getI18nSurfaces({ addons: ["wxt"] })).toEqual(["wxt-react"]);
    expect(
      getI18nSurfaces({ addons: ["wxt"], addonOptions: { wxt: { template: "vue" } } }),
    ).toEqual(["wxt-vue"]);
  });

  test("keeps a stable order across a full configuration", () => {
    expect(
      getI18nSurfaces({
        frontend: ["next", "native-bare"],
        backend: "hono",
        addons: ["wxt"],
      }),
    ).toEqual(["next", "native", "server", "wxt-react"]);
  });
});

describe("I18N_SUPPORT matrix", () => {
  test("defines every library by surface cell", () => {
    for (const library of I18N_LIBRARIES) {
      for (const surface of I18N_SURFACES) {
        const cell = I18N_SUPPORT[library][surface];
        expect(cell).toBeDefined();
        expect(SUPPORT_LEVELS).toContain(cell.level);
      }
    }
  });

  test("covers all four libraries and 20 surfaces", () => {
    expect(I18N_LIBRARIES).toHaveLength(4);
    expect(I18N_SURFACES).toHaveLength(20);
    expect(Object.keys(I18N_SUPPORT).sort()).toEqual([...I18N_LIBRARIES].sort());
  });

  test("gives every unsupported cell a user-facing note", () => {
    for (const library of I18N_LIBRARIES) {
      for (const surface of I18N_SURFACES) {
        const cell = I18N_SUPPORT[library][surface];
        if (cell.level === "unsupported") {
          expect(cell.note).toBeTruthy();
        }
      }
    }
  });

  test("softens wuchale cells that have no bundler integration", () => {
    // No Next/WXT bundler hook: extraction and transforms go through the CLI.
    expect(I18N_SUPPORT.wuchale.next.level).toBe("adapter");
    for (const surface of ["wxt-react", "wxt-solid", "wxt-svelte"] as const) {
      expect(I18N_SUPPORT.wuchale[surface].level).toBe("adapter");
    }

    // wuchale#484: the Vite plugin crashes under Vite 8, so these are partial.
    for (const surface of [
      "tanstack-start",
      "tanstack-router",
      "react-router",
      "svelte",
      "solid",
    ] as const) {
      expect(I18N_SUPPORT.wuchale[surface].level).toBe("partial");
      expect(I18N_SUPPORT.wuchale[surface].note).toContain("Vite 8");
    }
  });
});

describe("I18N_LIBRARY_META", () => {
  test("marks only wuchale experimental", () => {
    expect(I18N_LIBRARY_META.wuchale.experimental).toBe(true);
    expect(I18N_LIBRARY_META.lingui.experimental).toBe(false);
    expect(I18N_LIBRARY_META.paraglide.experimental).toBe(false);
    expect(I18N_LIBRARY_META.i18next.experimental).toBe(false);
  });

  test("exposes the catalog format and key style per library", () => {
    expect(I18N_LIBRARY_META.lingui).toMatchObject({
      keyStyle: "source-text",
      catalogFormat: "po",
    });
    expect(I18N_LIBRARY_META.paraglide).toMatchObject({
      keyStyle: "id",
      catalogFormat: "inlang-json",
    });
    expect(I18N_LIBRARY_META.wuchale.keyStyle).toBe("implicit");
  });
});

describe("validateI18nCompatibility", () => {
  test("rejects a library on an unsupported surface with the shared reason string", () => {
    const result = validateI18nCompatibility("lingui", { frontend: ["svelte"] });

    expect(result).toEqual({
      isCompatible: false,
      reason: "Lingui doesn't support svelte: No Svelte template support.",
      blockingSurfaces: ["svelte"],
    });
  });

  test("uses the documented reason format for wuchale on nuxt", () => {
    const result = validateI18nCompatibility("wuchale", { frontend: ["nuxt"] });

    expect(result.isCompatible).toBe(false);
    if (!result.isCompatible) {
      expect(result.reason).toBe("wuchale doesn't support nuxt: No Vue adapter.");
    }
  });

  test("accepts a compatible configuration and reports partial-support warnings", () => {
    const result = validateI18nCompatibility("lingui", { frontend: ["astro"] });

    expect(result.isCompatible).toBe(true);
    if (result.isCompatible) {
      expect(result.warnings).toContain(
        "Macros work only in frontmatter and islands, not in `.astro` markup.",
      );
    }
  });

  test("collects every blocking surface for a multi-surface rejection", () => {
    const result = validateI18nCompatibility("lingui", {
      frontend: ["svelte"],
      addons: ["wxt"],
      addonOptions: { wxt: { template: "svelte" } },
    });

    expect(result.isCompatible).toBe(false);
    if (!result.isCompatible) {
      expect(result.blockingSurfaces).toEqual(["svelte", "wxt-svelte"]);
    }
  });
});

describe("getCompatibleI18nLibraries / getDefaultI18nLibrary", () => {
  test("offers lingui first when every library is compatible", () => {
    expect(getDefaultI18nLibrary({ frontend: ["next"] })).toBe("lingui");
  });

  test("skips an incompatible lingui and picks paraglide", () => {
    expect(getCompatibleI18nLibraries({ frontend: ["svelte"] })).toEqual([
      "paraglide",
      "i18next",
      "wuchale",
    ]);
    expect(getDefaultI18nLibrary({ frontend: ["svelte"] })).toBe("paraglide");
  });

  test("never returns wuchale even when it is the only compatible candidate", () => {
    const config: I18nConfigInput = {
      frontend: ["svelte"],
      addons: ["wxt"],
      addonOptions: { wxt: { template: "svelte" } },
    };
    const compatible = getCompatibleI18nLibraries(config);

    expect(compatible).not.toContain("lingui");
    expect(getDefaultI18nLibrary(config)).not.toBe("wuchale");
  });
});

describe("validateI18nOptions", () => {
  test("accepts the schema defaults", () => {
    expect(validateI18nOptions(defaultOptions())).toEqual({ isOk: true });
  });

  test("rejects a non-canonical locale tag", () => {
    const result = validateI18nOptions(
      I18nOptionsSchema.parse({ sourceLocale: "en", locales: ["EN"] }),
    );

    expect(result.isOk).toBe(false);
  });

  test("rejects a source locale that is not in locales", () => {
    const result = validateI18nOptions(
      I18nOptionsSchema.parse({ sourceLocale: "de", locales: ["en", "fr"] }),
    );

    expect(result.isOk).toBe(false);
  });

  test("rejects duplicate locales", () => {
    const result = validateI18nOptions(
      I18nOptionsSchema.parse({ sourceLocale: "en", locales: ["en", "en"] }),
    );

    expect(result.isOk).toBe(false);
  });

  test("rejects domain keys outside the configured locales", () => {
    const result = validateI18nOptions(
      I18nOptionsSchema.parse({
        sourceLocale: "en",
        locales: ["en", "fr"],
        routing: { strategy: "domain", domains: { de: "de.example.com" } },
      }),
    );

    expect(result.isOk).toBe(false);
  });

  test("rejects duplicate domain hosts", () => {
    const result = validateI18nOptions(
      I18nOptionsSchema.parse({
        sourceLocale: "en",
        locales: ["en", "fr", "es"],
        routing: { strategy: "domain", domains: { fr: "a.example.com", es: "a.example.com" } },
      }),
    );

    expect(result.isOk).toBe(false);
  });

  test("accepts a valid domain mapping", () => {
    const result = validateI18nOptions(
      I18nOptionsSchema.parse({
        sourceLocale: "en",
        locales: ["en", "fr"],
        routing: { strategy: "domain", domains: { fr: "fr.example.com" } },
      }),
    );

    expect(result).toEqual({ isOk: true });
  });
});

describe("getI18nRoutingSupport", () => {
  test("supports cookie routing everywhere", () => {
    expect(getI18nRoutingSupport("cookie", { frontend: ["svelte"] }, "lingui")).toEqual({
      isSupported: true,
    });
  });

  test("gates prefix routing on the library for svelte and tanstack-router", () => {
    expect(getI18nRoutingSupport("prefix", { frontend: ["svelte"] }, "lingui").isSupported).toBe(
      false,
    );
    expect(getI18nRoutingSupport("prefix", { frontend: ["svelte"] }, "paraglide").isSupported).toBe(
      true,
    );
    expect(
      getI18nRoutingSupport("prefix", { frontend: ["tanstack-router"] }, "lingui").isSupported,
    ).toBe(false);
    expect(
      getI18nRoutingSupport("prefix", { frontend: ["tanstack-router"] }, "paraglide").isSupported,
    ).toBe(true);
  });

  test("supports prefix routing for the server-rendered frameworks", () => {
    expect(getI18nRoutingSupport("prefix", { frontend: ["next"] }, "i18next").isSupported).toBe(
      true,
    );
    expect(getI18nRoutingSupport("prefix", { frontend: ["nuxt"] }, "i18next").isSupported).toBe(
      true,
    );
  });

  test("blocks domain routing on static or SPA surfaces with a reason", () => {
    const spa = getI18nRoutingSupport("domain", { frontend: ["react-router"] }, "paraglide");
    expect(spa.isSupported).toBe(false);
    if (!spa.isSupported) expect(spa.reason).toContain("react-router");

    expect(getI18nRoutingSupport("domain", { frontend: ["astro"] }, "paraglide").isSupported).toBe(
      false,
    );
  });

  test("allows domain routing on a server-rendered surface", () => {
    expect(
      getI18nRoutingSupport("domain", { frontend: ["tanstack-start"] }, "paraglide").isSupported,
    ).toBe(true);
    expect(getI18nRoutingSupport("domain", { frontend: ["next"] }, "i18next").isSupported).toBe(
      true,
    );
  });
});

describe("getI18nIntegrations", () => {
  test("keeps dependency-branch integrations inert in core", () => {
    const active = getI18nIntegrations(
      { frontend: ["next"], backend: "hono", auth: "better-auth" },
      "lingui",
    ).map((integration) => integration.id);

    expect(active).not.toContain("turnstile-language");
    expect(active).not.toContain("payments-checkout-locale");
    expect(active).not.toContain("shadcn-direction");
    expect(active).not.toContain("react-email-locale");

    const branches = I18N_INTEGRATIONS.filter(
      (integration) => integration.dependsOnBranch !== undefined,
    ).map((integration) => integration.id);
    expect(branches).toEqual([
      "turnstile-language",
      "payments-checkout-locale",
      "shadcn-direction",
      "react-email-locale",
    ]);
  });

  test("enables built-in localizations for the selected stack", () => {
    const active = getI18nIntegrations(
      { frontend: ["next"], backend: "hono", runtime: "bun", auth: "better-auth", api: "trpc" },
      "lingui",
    ).map((integration) => integration.id);

    expect(active).toContain("better-auth-i18n");
    expect(active).toContain("zod-locales");
    expect(active).toContain("server-locale-middleware");
    expect(active).toContain("lingui-bun-preload");
    expect(active).not.toContain("nuxt-ui-locale");
  });

  test("enables framework integrations per surface and addon", () => {
    const nuxt = getI18nIntegrations({ frontend: ["nuxt"] }, "i18next").map((i) => i.id);
    expect(nuxt).toContain("nuxt-ui-locale");
    expect(nuxt).toContain("nuxt-i18n-module");

    const wxt = getI18nIntegrations({ addons: ["wxt"] }, "paraglide").map((i) => i.id);
    expect(wxt).toContain("wxt-i18n");

    const native = getI18nIntegrations({ frontend: ["native-bare"] }, "lingui").map((i) => i.id);
    expect(native).toContain("expo-localization");
  });

  test("only enables the lingui skills integration for lingui with the skills addon", () => {
    const linguiSkills = getI18nIntegrations({ addons: ["skills"] }, "lingui").map((i) => i.id);
    expect(linguiSkills).toContain("lingui-skills");

    const i18nextSkills = getI18nIntegrations({ addons: ["skills"] }, "i18next").map((i) => i.id);
    expect(i18nextSkills).not.toContain("lingui-skills");
  });

  test("only enables react-email-locale when the email feature is present", () => {
    const withEmail = getI18nIntegrations(
      { frontend: ["next"], auth: "better-auth", emailRenderer: "react-email" },
      "lingui",
    ).map((i) => i.id);
    expect(withEmail).toContain("react-email-locale");

    const withoutEmail = getI18nIntegrations(
      { frontend: ["next"], auth: "better-auth" },
      "lingui",
    ).map((i) => i.id);
    expect(withoutEmail).not.toContain("react-email-locale");

    const rendererOff = getI18nIntegrations(
      { frontend: ["next"], auth: "better-auth", emailRenderer: "none" },
      "lingui",
    ).map((i) => i.id);
    expect(rendererOff).not.toContain("react-email-locale");
  });

  test("enables payments-checkout-locale only for providers with a checkout locale", () => {
    const activeFor = (payments?: "polar" | "stripe" | "autumn" | "dodo" | "commet"): string[] =>
      getI18nIntegrations(
        { frontend: ["next"], backend: "hono", auth: "better-auth", payments },
        "lingui",
      ).map((integration) => integration.id);

    expect(activeFor("polar")).toContain("payments-checkout-locale");
    expect(activeFor("stripe")).toContain("payments-checkout-locale");
    expect(activeFor("dodo")).not.toContain("payments-checkout-locale");
    expect(activeFor("autumn")).not.toContain("payments-checkout-locale");
    expect(activeFor("commet")).not.toContain("payments-checkout-locale");
    expect(activeFor()).not.toContain("payments-checkout-locale");
  });

  test("labels every integration and keeps ids unique", () => {
    const ids = I18N_INTEGRATIONS.map((integration) => integration.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const integration of I18N_INTEGRATIONS) {
      expect(integration.label.length).toBeGreaterThan(0);
    }
  });
});

describe("integration ids and libraries stay in sync with the registry", () => {
  test("every library key has metadata and a matrix row", () => {
    for (const library of I18N_LIBRARIES as readonly I18nLibrary[]) {
      expect(I18N_LIBRARY_META[library]).toBeDefined();
      expect(I18N_SUPPORT[library]).toBeDefined();
    }
  });

  test("marks only verified providers as locale-aware checkouts", () => {
    expect(getPaymentProvider("polar").checkoutLocale).toBe("api");
    expect(getPaymentProvider("stripe").checkoutLocale).toBe("api");
    for (const id of PAYMENT_PROVIDER_IDS) {
      if (id === "stripe") continue;
      expect(getPaymentProvider(id).checkoutLocale).toBe("none");
    }
  });
});

describe("shadcn direction", () => {
  test("derives the text direction from the locale tag", () => {
    expect(getTextDirection("ar")).toBe("rtl");
    expect(getTextDirection("he-IL")).toBe("rtl");
    expect(getTextDirection("en")).toBe("ltr");
    expect(getTextDirection("pt-BR")).toBe("ltr");
  });

  test("falls back to the RTL language table for unknown tags", () => {
    expect(getTextDirection("")).toBe("ltr");
    expect(getTextDirection("xx")).toBe("ltr");
    expect(hasRtlLocale(["en", "fa-AF", "fr"])).toBe(true);
    expect(hasRtlLocale(["en", "es", "fr"])).toBe(false);
  });

  test("activates shadcn-direction only when shadcn is configured", () => {
    const withoutShadcn = getI18nIntegrations({ frontend: ["next"] }, "lingui").map((i) => i.id);
    expect(withoutShadcn).not.toContain("shadcn-direction");

    const withShadcn = getI18nIntegrations(
      { frontend: ["next"], shadcn: { rtl: false } },
      "lingui",
    ).map((i) => i.id);
    expect(withShadcn).toContain("shadcn-direction");
  });

  test("uses locale-derived direction only for i18n stacks with RTL support", () => {
    expect(usesShadcnLocaleDirection({ shadcn: { rtl: true }, i18n: "lingui" })).toBe(true);

    expect(
      usesShadcnLocaleDirection({
        shadcn: { rtl: false },
        i18n: "i18next",
        i18nOptions: { ...defaultOptions(), locales: ["en", "ar"] },
      }),
    ).toBe(true);

    expect(
      usesShadcnLocaleDirection({
        shadcn: { rtl: false },
        i18n: "lingui",
        i18nOptions: { ...defaultOptions(), locales: ["en", "es", "fr"] },
      }),
    ).toBe(false);
    expect(usesShadcnLocaleDirection({ shadcn: { rtl: true }, i18n: "none" })).toBe(false);
    expect(usesShadcnLocaleDirection({ i18n: "lingui" })).toBe(false);
  });
});
