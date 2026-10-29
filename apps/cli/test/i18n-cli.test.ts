import { beforeEach, describe, expect, it } from "bun:test";

import { FailedToExitError } from "trpc-cli";

import { createBtsCli, getSchemaResult, SchemaNameSchema } from "../src/index";
import {
  buildI18nLibraryOptions,
  buildI18nRoutingOptions,
  validateI18nLocalesInput,
} from "../src/prompts/i18n-options";
import { getDefaultI18nLibrary, type I18nOptions, type ProjectConfig } from "../src/types";
import { processFlags } from "../src/utils/config-processing";
import { getConfigSections } from "../src/utils/display-config";
import {
  normalizeResolvedI18n,
  resolveI18nCliFlags,
  toI18nConfigInput,
  validateI18nConfig,
} from "../src/utils/i18n-cli";
import { oracleCompatibility, oracleRoutingSupport } from "./oracles/i18n";

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "i18n-app",
    projectDir: "/tmp/i18n-app",
    relativePath: "i18n-app",
    database: "none",
    orm: "none",
    backend: "hono",
    runtime: "bun",
    frontend: ["next"],
    addons: [],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "none",
    git: false,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

const LINGUI_OPTIONS: I18nOptions = {
  sourceLocale: "en",
  locales: ["en", "fr"],
  routing: { strategy: "prefix", prefixDefaultLocale: false },
  translateSkill: false,
};

describe("resolveI18nCliFlags", () => {
  it("derives i18nOptions from --i18n-locales with the first locale as source", () => {
    const result = resolveI18nCliFlags({ i18n: "lingui", i18nLocales: "en,fr,de" });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value.i18n).toBe("lingui");
    expect(result.value.i18nOptions?.locales).toEqual(["en", "fr", "de"]);
    expect(result.value.i18nOptions?.sourceLocale).toBe("en");
    expect(result.value.i18nOptions?.translateSkill).toBe(true);
    expect(result.value).not.toHaveProperty("i18nLocales");
  });

  it("uses --i18n-source-locale when given", () => {
    const result = resolveI18nCliFlags({
      i18n: "i18next",
      i18nLocales: "en,fr",
      i18nSourceLocale: "fr",
      i18nSkill: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value.i18nOptions?.sourceLocale).toBe("fr");
    expect(result.value.i18nOptions?.translateSkill).toBe(false);
  });

  it("folds --i18n-routing and repeatable --i18n-domain flags into the domain map", () => {
    const result = resolveI18nCliFlags({
      i18n: "paraglide",
      i18nLocales: "en,fr",
      i18nRouting: "domain",
      i18nDomain: ["en=example.com", "fr=fr.example.com"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value.i18nOptions?.routing).toEqual({
      strategy: "domain",
      prefixDefaultLocale: false,
      domains: { en: "example.com", fr: "fr.example.com" },
    });
  });

  it("rejects malformed domain entries", () => {
    const result = resolveI18nCliFlags({
      i18n: "paraglide",
      i18nRouting: "domain",
      i18nDomain: ["fr.example.com"],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("--i18n-domain");
  });

  it("requires domain routing for --i18n-domain", () => {
    const result = resolveI18nCliFlags({ i18n: "paraglide", i18nDomain: ["fr=fr.example.com"] });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("--i18n-routing domain");
  });

  it("rejects i18n option flags combined with --i18n none", () => {
    const result = resolveI18nCliFlags({ i18n: "none", i18nLocales: "en,fr" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("--i18n none");
  });

  it("rejects invalid locales through the shared validator", () => {
    const result = resolveI18nCliFlags({ i18n: "lingui", i18nLocales: "en,en" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("duplicates");
  });

  it("leaves inputs without i18n option flags untouched", () => {
    const result = resolveI18nCliFlags({ i18n: "wuchale", backend: "hono" });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value).toEqual({ i18n: "wuchale", backend: "hono" });
  });
});

describe("processFlags i18n plumbing", () => {
  it("copies i18n and i18nOptions into the partial project config", () => {
    const config = processFlags({ i18n: "lingui", i18nOptions: LINGUI_OPTIONS });

    expect(config.i18n).toBe("lingui");
    expect(config.i18nOptions).toEqual(LINGUI_OPTIONS);
  });
});

describe("validateI18nConfig", () => {
  it("accepts a compatible library with no explicit options", () => {
    const result = validateI18nConfig(baseConfig({ i18n: "lingui" }));

    expect(result.isOk()).toBe(true);
  });

  it("rejects an incompatible surface with the shared reason", () => {
    const config = baseConfig({ frontend: ["svelte"], api: "orpc", i18n: "lingui" });
    const result = validateI18nConfig(config);
    const expectedReason = oracleCompatibility("lingui", ["svelte"]).reason;

    expect(result.isErr()).toBe(true);
    expect(expectedReason).toBeDefined();
    if (result.isErr() && expectedReason !== undefined) {
      expect(result.error.message).toBe(expectedReason);
    }
  });

  it("ignores i18n when the library is none", () => {
    const result = validateI18nConfig(baseConfig({ frontend: ["svelte"], i18n: "none" }));

    expect(result.isOk()).toBe(true);
  });

  it("rejects invalid options through the shared option validator", () => {
    const options: I18nOptions = {
      sourceLocale: "en",
      locales: ["en", "en"],
      translateSkill: true,
    };
    const result = validateI18nConfig(baseConfig({ i18n: "lingui", i18nOptions: options }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("duplicates");
  });

  it("rejects unsupported routing with the shared routing reason", () => {
    const config = baseConfig({
      frontend: ["tanstack-router"],
      i18n: "i18next",
      i18nOptions: {
        sourceLocale: "en",
        locales: ["en", "fr"],
        routing: { strategy: "prefix", prefixDefaultLocale: false },
        translateSkill: true,
      },
    });
    const result = validateI18nConfig(config);
    const expectedReason = oracleRoutingSupport("prefix", "i18next", ["tanstack-router"]).reason;

    expect(result.isErr()).toBe(true);
    expect(expectedReason).toBeDefined();
    if (result.isErr() && expectedReason !== undefined) {
      expect(result.error.message).toBe(expectedReason);
    }
  });

  it("maps the project config into the shared compatibility input", () => {
    const config = baseConfig({ frontend: ["svelte"], addons: ["tauri"], backend: "hono" });

    expect(toI18nConfigInput(config)).toEqual({
      frontend: ["svelte"],
      backend: "hono",
      runtime: "bun",
      auth: "none",
      api: "trpc",
      payments: "none",
      addons: ["tauri"],
      addonOptions: undefined,
    });
  });
});

describe("normalizeResolvedI18n", () => {
  it("drops orphaned options when i18n is none", () => {
    const config = normalizeResolvedI18n(baseConfig({ i18n: "none", i18nOptions: LINGUI_OPTIONS }));

    expect(config.i18n).toBe("none");
    expect(config.i18nOptions).toBeUndefined();
  });

  it("materializes the shared option defaults when i18n is enabled", () => {
    const config = normalizeResolvedI18n(baseConfig({ i18n: "lingui" }));

    expect(config.i18nOptions?.locales).toEqual(["en", "es", "fr"]);
    expect(config.i18nOptions?.sourceLocale).toBe("en");
    expect(config.i18nOptions?.translateSkill).toBe(true);
  });

  it("keeps explicit options untouched", () => {
    const config = normalizeResolvedI18n(
      baseConfig({ i18n: "lingui", i18nOptions: LINGUI_OPTIONS }),
    );

    expect(config.i18nOptions).toEqual(LINGUI_OPTIONS);
  });
});

describe("i18n prompt option builders", () => {
  it("disables incompatible libraries with the exact shared reason", () => {
    const options = buildI18nLibraryOptions({ frontend: ["svelte"] });
    const lingui = options.find((option) => option.value === "lingui");

    expect(lingui?.disabled).toBe(true);
    expect(lingui?.hint).toBe(oracleCompatibility("lingui", ["svelte"]).reason);
    expect(options.find((option) => option.value === "paraglide")?.disabled).toBeUndefined();
    expect(getDefaultI18nLibrary({ frontend: ["svelte"] })).toBe("paraglide");
  });

  it("labels wuchale as experimental", () => {
    const options = buildI18nLibraryOptions({ frontend: ["next"] });
    const wuchale = options.find((option) => option.value === "wuchale");

    expect(wuchale?.label).toContain("experimental");
    expect(wuchale?.disabled).toBeUndefined();
  });

  it("disables unsupported routing strategies with the shared reason", () => {
    const options = buildI18nRoutingOptions({ frontend: ["tanstack-router"] }, "i18next");
    const prefix = options.find((option) => option.value === "prefix");

    expect(options).toHaveLength(3);
    expect(prefix?.disabled).toBe(true);
    expect(prefix?.hint).toBe(
      oracleRoutingSupport("prefix", "i18next", ["tanstack-router"]).reason,
    );
    expect(options.find((option) => option.value === "cookie")?.disabled).toBeUndefined();
    expect(buildI18nRoutingOptions({ frontend: ["next"] }, "none")).toEqual([]);
  });

  it("validates locale input through the shared i18n rules", () => {
    expect(validateI18nLocalesInput("en,fr,de")).toBeUndefined();
    expect(validateI18nLocalesInput("en,en")).toContain("duplicates");
    expect(validateI18nLocalesInput("en,EN")).toContain("canonical");
    expect(validateI18nLocalesInput("not a locale!")).toBeDefined();
    expect(validateI18nLocalesInput("")).toBeDefined();
  });
});

describe("i18n summary rows", () => {
  it("shows the library, locales, routing and integrations when i18n is enabled", () => {
    const config = baseConfig({ i18n: "lingui", i18nOptions: LINGUI_OPTIONS });
    const product = getConfigSections(config).find((section) => section.title === "Product");

    expect(product?.rows).toContainEqual({ label: "i18n", value: "Lingui" });
    expect(product?.rows).toContainEqual({ label: "Locales", value: "en, fr" });
    expect(product?.rows).toContainEqual({ label: "Routing", value: "Prefix" });

    const alsoSetsUp = product?.rows.find((row) => row.label === "Also sets up");
    expect(alsoSetsUp?.value).toContain("Zod error messages");
    expect(alsoSetsUp?.value).toContain("Server locale middleware");
  });

  it("omits i18n rows when i18n is none", () => {
    const product = getConfigSections(baseConfig()).find((section) => section.title === "Product");

    expect(product?.rows.some((row) => row.label === "i18n")).toBe(false);
    expect(product?.rows.some((row) => row.label === "Also sets up")).toBe(false);
  });
});

describe("i18n CLI flags end to end", () => {
  beforeEach(() => {
    process.env.BTS_SKIP_EXTERNAL_COMMANDS = "1";
    process.env.BTS_TEST_MODE = "1";
  });

  it("parses the D1 flag set and lands it in the project config", async () => {
    const failure = await createBtsCli()
      .run({
        argv: [
          "create",
          "i18n-cli-flags",
          "--frontend",
          "next",
          "--backend",
          "hono",
          "--runtime",
          "bun",
          "--api",
          "trpc",
          "--database",
          "none",
          "--orm",
          "none",
          "--db-setup",
          "none",
          "--auth",
          "none",
          "--payments",
          "none",
          "--addons",
          "none",
          "--examples",
          "none",
          "--web-deploy",
          "none",
          "--server-deploy",
          "none",
          "--package-manager",
          "bun",
          "--no-git",
          "--no-install",
          "--directory-conflict",
          "error",
          "--dry-run",
          "--disable-analytics",
          "--verbose",
          "--i18n",
          "lingui",
          "--i18n-locales",
          "en,fr",
          "--i18n-routing",
          "domain",
          "--i18n-domain",
          "en=example.com",
          "--i18n-domain",
          "fr=fr.example.com",
        ],
        logger: { info: () => {}, error: () => {} },
        process: { exit: () => 0 as never },
      })
      .catch((error) => error);

    expect(failure).toBeInstanceOf(FailedToExitError);
    if (!(failure instanceof FailedToExitError)) return;
    expect(failure.exitCode).toBe(0);

    const result = failure.cause as {
      projectConfig?: { i18n?: string; i18nOptions?: I18nOptions };
    };
    expect(result.projectConfig?.i18n).toBe("lingui");
    expect(result.projectConfig?.i18nOptions?.locales).toEqual(["en", "fr"]);
    expect(result.projectConfig?.i18nOptions?.sourceLocale).toBe("en");
    expect(result.projectConfig?.i18nOptions?.routing).toEqual({
      strategy: "domain",
      prefixDefaultLocale: false,
      domains: { en: "example.com", fr: "fr.example.com" },
    });
  });
});

describe("i18n schema names", () => {
  it("exposes the i18n and i18nOptions schemas by name", () => {
    expect(SchemaNameSchema.safeParse("i18n").success).toBe(true);
    expect(SchemaNameSchema.safeParse("i18nOptions").success).toBe(true);
    expect(getSchemaResult("i18nOptions")).toMatchObject({ type: "object" });
  });
});
