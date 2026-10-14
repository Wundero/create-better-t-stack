import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { ProjectConfig } from "@better-t-stack/types";

import { processTemplateString } from "../src/core/template-processor";
import { loadTemplates } from "../src/core/template-reader";
import { VirtualFileSystem } from "../src/core/virtual-fs";
import { processI18nDeps } from "../src/processors/i18n-deps";
import { processApiTemplates } from "../src/template-handlers/api";
import { processAuthTemplates } from "../src/template-handlers/auth";
import { processBackendTemplates } from "../src/template-handlers/backend";
import { processBaseTemplate } from "../src/template-handlers/base";
import { processDeployTemplates } from "../src/template-handlers/deploy";
import { processFrontendTemplates } from "../src/template-handlers/frontend";
import { processI18nTemplates } from "../src/template-handlers/i18n";

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["next"],
    addons: ["turborepo"],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "lingui",
    git: true,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

async function generateVfs(config: ProjectConfig): Promise<VirtualFileSystem> {
  const templates = await loadTemplates();
  const vfs = new VirtualFileSystem();
  await processBaseTemplate(vfs, templates, config);
  await processFrontendTemplates(vfs, templates, config);
  await processBackendTemplates(vfs, templates, config);
  await processApiTemplates(vfs, templates, config);
  await processAuthTemplates(vfs, templates, config);
  await processDeployTemplates(vfs, templates, config);
  await processI18nTemplates(vfs, templates, config);
  processI18nDeps(vfs, config);
  return vfs;
}

// --- Rendered helper behaviour ---------------------------------------------

interface RoutingModule {
  localizeHref(href: string, locale?: string): string;
  stripLocalePrefix(pathname: string): string;
  localeOverrideFromUrl(url: string | URL): string | undefined;
  negotiateRequestLocale(sources: {
    url: string | URL;
    header?: string | null;
    cookieHeader?: string | null;
    acceptLanguage?: string | null;
  }): string;
  hreflangLinks(pathname?: string, origin?: string): { hreflang: string; href: string }[];
}

interface ClientModule {
  getClientLocale(): string;
  localeHeader(): Record<string, string>;
  localeInit(init?: RequestInit): RequestInit;
}

let importCounter = 0;

async function importGenerated<T>(files: Record<string, string>, entry: string): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "i18n-routing-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
    const url = `${pathToFileURL(join(dir, entry)).href}?v=${importCounter++}`;
    return (await import(url)) as T;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function loadHelperModules(
  config: ProjectConfig,
  entry: "routing" | "client",
): Promise<Record<string, string>> {
  const templates = await loadTemplates("i18n");
  const configSource = templates.get("i18n/shared/src/config.ts.hbs");
  const sharedSource = templates.get(`i18n/routing/shared/src/${entry}.ts.hbs`);
  if (!configSource || !sharedSource) {
    throw new Error(`missing routing templates for ${entry}`);
  }
  return {
    "config.ts": processTemplateString(configSource, config),
    [`${entry}.ts`]: processTemplateString(sharedSource, config),
  };
}

describe("localizeHref", () => {
  const prefixConfig = baseConfig({
    frontend: ["next"],
    i18n: "lingui",
    i18nOptions: {
      sourceLocale: "en",
      locales: ["en", "fr"],
      routing: { strategy: "prefix", prefixDefaultLocale: false },
      translateSkill: true,
    },
  });

  test("prefixes non-source locales and keeps the source locale bare", async () => {
    const modules = await loadHelperModules(prefixConfig, "routing");
    const { localizeHref } = await importGenerated<RoutingModule>(modules, "routing.ts");

    expect(localizeHref("/about", "fr")).toBe("/fr/about");
    expect(localizeHref("/about", "en")).toBe("/about");
    expect(localizeHref("/", "fr")).toBe("/fr");
    expect(localizeHref("/about?page=2#top", "fr")).toBe("/fr/about?page=2#top");
  });

  test("is idempotent and leaves external URLs alone", async () => {
    const modules = await loadHelperModules(prefixConfig, "routing");
    const { localizeHref } = await importGenerated<RoutingModule>(modules, "routing.ts");

    expect(localizeHref("/fr/about", "fr")).toBe("/fr/about");
    expect(localizeHref("https://example.com/about", "fr")).toBe("https://example.com/about");
    expect(localizeHref("#section", "fr")).toBe("#section");
  });

  test("prefixes the source locale when prefixDefaultLocale is on", async () => {
    const config = baseConfig({
      i18nOptions: {
        sourceLocale: "en",
        locales: ["en", "fr"],
        routing: { strategy: "prefix", prefixDefaultLocale: true },
        translateSkill: true,
      },
    });
    const modules = await loadHelperModules(config, "routing");
    const { localizeHref } = await importGenerated<RoutingModule>(modules, "routing.ts");

    expect(localizeHref("/about", "en")).toBe("/en/about");
  });

  test("returns absolute URLs on the mapped domain host", async () => {
    const config = baseConfig({
      i18n: "i18next",
      i18nOptions: {
        sourceLocale: "en",
        locales: ["en", "fr"],
        routing: {
          strategy: "domain",
          prefixDefaultLocale: false,
          domains: { en: "en.example.com", fr: "fr.example.com" },
        },
        translateSkill: true,
      },
    });
    const modules = await loadHelperModules(config, "routing");
    const { localizeHref, stripLocalePrefix } = await importGenerated<RoutingModule>(
      modules,
      "routing.ts",
    );

    expect(localizeHref("/about", "fr")).toBe("https://fr.example.com/about");
    expect(stripLocalePrefix("/fr/about")).toBe("/about");
  });

  test("hreflang links cover every locale and x-default", async () => {
    const config = baseConfig({
      i18n: "i18next",
      i18nOptions: {
        sourceLocale: "en",
        locales: ["en", "fr"],
        routing: {
          strategy: "domain",
          prefixDefaultLocale: false,
          domains: { en: "en.example.com", fr: "fr.example.com" },
        },
        translateSkill: true,
      },
    });
    const modules = await loadHelperModules(config, "routing");
    const { hreflangLinks } = await importGenerated<RoutingModule>(modules, "routing.ts");

    expect(hreflangLinks("/about", "https://en.example.com")).toEqual([
      { hreflang: "en", href: "https://en.example.com/about" },
      { hreflang: "fr", href: "https://fr.example.com/about" },
      { hreflang: "x-default", href: "https://en.example.com/about" },
    ]);
  });
});

describe("negotiateRequestLocale", () => {
  const prefixConfig = baseConfig({
    i18n: "lingui",
    i18nOptions: {
      sourceLocale: "en",
      locales: ["en", "fr"],
      routing: { strategy: "prefix", prefixDefaultLocale: false },
      translateSkill: true,
    },
  });

  test("follows the D5 order: prefix segment, header, cookie, Accept-Language", async () => {
    const modules = await loadHelperModules(prefixConfig, "routing");
    const { negotiateRequestLocale } = await importGenerated<RoutingModule>(modules, "routing.ts");

    expect(negotiateRequestLocale({ url: "http://localhost:3000/fr/about" })).toBe("fr");
    expect(
      negotiateRequestLocale({
        url: "http://localhost:3000/about",
        header: "fr",
        cookieHeader: "locale=en",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("fr");
    expect(
      negotiateRequestLocale({
        url: "http://localhost:3000/about",
        cookieHeader: "locale=fr",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("fr");
    expect(
      negotiateRequestLocale({
        url: "http://localhost:3000/about",
        acceptLanguage: "fr-CA,fr;q=0.9",
      }),
    ).toBe("fr");
  });

  test("resolves the locale from the host for domain routing", async () => {
    const config = baseConfig({
      i18n: "i18next",
      i18nOptions: {
        sourceLocale: "en",
        locales: ["en", "fr"],
        routing: {
          strategy: "domain",
          prefixDefaultLocale: false,
          domains: { en: "en.example.com", fr: "fr.example.com" },
        },
        translateSkill: true,
      },
    });
    const modules = await loadHelperModules(config, "routing");
    const { negotiateRequestLocale, localeOverrideFromUrl } = await importGenerated<RoutingModule>(
      modules,
      "routing.ts",
    );

    expect(negotiateRequestLocale({ url: "https://fr.example.com/about" })).toBe("fr");
    expect(negotiateRequestLocale({ url: "https://en.example.com/about" })).toBe("en");
    expect(localeOverrideFromUrl("http://localhost:3000/about?locale=fr")).toBe("fr");
    expect(localeOverrideFromUrl("https://example.com/about?locale=fr")).toBeUndefined();
    expect(negotiateRequestLocale({ url: "http://localhost:3000/about?locale=fr" })).toBe("fr");
  });
});

describe("client helpers", () => {
  test("localeHeader sends x-app-locale and localeInit merges it", async () => {
    const config = baseConfig();
    const modules = await loadHelperModules(config, "client");
    const { localeHeader, localeInit } = await importGenerated<ClientModule>(modules, "client.ts");

    expect(localeHeader()).toEqual({ "x-app-locale": "en" });

    const init = localeInit({ headers: { "x-custom": "1" } });
    const headers = new Headers(init.headers);
    expect(headers.get("x-app-locale")).toBe("en");
    expect(headers.get("x-custom")).toBe("1");
  });
});

// --- Generation wiring ------------------------------------------------------

describe("routing generation", () => {
  test("emits the shared routing and client helpers for every strategy", async () => {
    const vfs = await generateVfs(baseConfig());

    expect(vfs.exists("packages/i18n/src/routing.ts")).toBe(true);
    expect(vfs.exists("packages/i18n/src/client.ts")).toBe(true);
  });

  test("adds x-app-locale to the tRPC client without touching plain projects", async () => {
    const vfs = await generateVfs(baseConfig({ auth: "better-auth" }));
    const client = vfs.readFile("apps/web/src/utils/trpc.ts") ?? "";

    expect(client).toContain("localeInit(");

    const plain = await generateVfs(baseConfig({ i18n: "none" }));
    expect(plain.readFile("apps/web/src/utils/trpc.ts") ?? "").not.toContain("i18n/client");

    const noAuth = await generateVfs(baseConfig());
    expect(noAuth.readFile("apps/web/src/utils/trpc.ts") ?? "").toContain("fetch: localeFetch");
  });

  test("adds x-app-locale to the oRPC and native clients", async () => {
    const orpc = await generateVfs(baseConfig({ api: "orpc", auth: "none" }));
    expect(orpc.readFile("apps/web/src/utils/orpc.ts") ?? "").toContain("fetch: localeFetch");

    const orpcAuth = await generateVfs(baseConfig({ api: "orpc", auth: "better-auth" }));
    expect(orpcAuth.readFile("apps/web/src/utils/orpc.ts") ?? "").toContain("localeInit(");

    const native = await generateVfs(
      baseConfig({ frontend: ["native-uniwind"], api: "orpc", auth: "none", i18n: "lingui" }),
    );
    expect(native.readFile("apps/native/utils/orpc.ts") ?? "").toContain(
      "headers: () => localeHeader()",
    );
  });

  test("adds x-app-locale to the Better Auth client fetchOptions", async () => {
    const vfs = await generateVfs(baseConfig({ auth: "better-auth" }));
    const client = vfs.readFile("apps/web/src/lib/auth-client.ts") ?? "";

    expect(client).toContain("customFetchImpl: localeFetch");
  });

  test("emits and registers the server middleware per backend", async () => {
    const hono = await generateVfs(baseConfig({ backend: "hono" }));
    expect(hono.exists("apps/server/src/middleware/locale.ts")).toBe(true);
    expect(hono.readFile("apps/server/src/index.ts") ?? "").toContain("app.use(localeMiddleware);");

    const express = await generateVfs(baseConfig({ backend: "express" }));
    expect(express.readFile("apps/server/src/index.ts") ?? "").toContain(
      "app.use(localeMiddleware);",
    );

    const fastify = await generateVfs(baseConfig({ backend: "fastify" }));
    expect(fastify.readFile("apps/server/src/index.ts") ?? "").toContain(
      "registerLocale(fastify);",
    );

    const elysia = await generateVfs(baseConfig({ backend: "elysia" }));
    const elysiaEntry = elysia.readFile("apps/server/src/index.ts") ?? "";
    expect(elysiaEntry).toContain("const app = new Elysia(");
    expect(elysiaEntry).toContain("withLocale(app);");
    expect(elysiaEntry).toContain("app.listen(3000");

    const nitro = await generateVfs(baseConfig({ backend: "nitro" }));
    expect(nitro.exists("apps/server/server/middleware/locale.ts")).toBe(true);
  });

  test("uses runWithLocale in the hono middleware", async () => {
    const vfs = await generateVfs(baseConfig({ backend: "hono" }));
    const middleware = vfs.readFile("apps/server/src/middleware/locale.ts") ?? "";

    expect(middleware).toContain("runWithLocale(locale, () => next())");
    expect(middleware).toContain("negotiateRequestLocale");
  });

  test("prefix routing emits the Next middleware only for routed strategies", async () => {
    const prefix = await generateVfs(
      baseConfig({
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: { strategy: "prefix", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );
    const middleware = prefix.readFile("apps/web/src/middleware.ts") ?? "";
    expect(middleware).toContain("NextResponse.rewrite");
    expect(middleware).toContain("stripLocalePrefix");

    const cookie = await generateVfs(baseConfig());
    expect(cookie.exists("apps/web/src/middleware.ts")).toBe(false);
  });

  test("prefix routing adds the SvelteKit reroute hooks for paraglide", async () => {
    const vfs = await generateVfs(
      baseConfig({
        frontend: ["svelte"],
        i18n: "paraglide",
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: { strategy: "prefix", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    expect(vfs.readFile("apps/web/src/hooks.client.ts") ?? "").toContain("reroute");
    expect(vfs.readFile("apps/web/src/hooks.server.ts") ?? "").toContain("paraglideMiddleware");
  });

  test("domain routing wires Better Auth, CORS and the cross-subdomain cookie", async () => {
    const vfs = await generateVfs(
      baseConfig({
        backend: "hono",
        auth: "better-auth",
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: {
            strategy: "domain",
            prefixDefaultLocale: false,
            domains: { en: "en.example.com", fr: "fr.example.com" },
          },
          translateSkill: true,
        },
      }),
    );

    const auth = vfs.readFile("packages/auth/src/index.ts") ?? "";
    expect(auth).toContain("...Object.values(localeDomains)");
    expect(auth).toContain('domain: ".example.com"');
    expect(auth).toContain('import { localeDomains } from "@demo/i18n/config";');

    const server = vfs.readFile("apps/server/src/index.ts") ?? "";
    expect(server).toContain("origin: [ENV.CORS_ORIGIN, ...Object.values(localeDomains)]");

    const authPackage = vfs.readJson<{ dependencies?: Record<string, string> }>(
      "packages/auth/package.json",
    );
    expect(authPackage?.dependencies?.["@demo/i18n"]).toBe("workspace:*");
  });

  test("keeps unrelated domains on separate sessions", async () => {
    const vfs = await generateVfs(
      baseConfig({
        auth: "better-auth",
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: {
            strategy: "domain",
            prefixDefaultLocale: false,
            domains: { en: "example.com", fr: "example.fr" },
          },
          translateSkill: true,
        },
      }),
    );

    expect(vfs.readFile("packages/auth/src/index.ts") ?? "").toContain(
      "...Object.values(localeDomains)",
    );
    expect(vfs.readFile("packages/auth/src/index.ts") ?? "").not.toContain("crossSubDomainCookies");
  });

  test("writes nothing extra when i18n is none", async () => {
    const vfs = await generateVfs(baseConfig({ i18n: "none" }));

    expect(vfs.exists("packages/i18n/src/routing.ts")).toBe(false);
    expect(vfs.exists("apps/server/src/middleware/locale.ts")).toBe(false);
    expect(vfs.readFile("apps/server/src/index.ts") ?? "").not.toContain("localeMiddleware");
  });

  test("workers keep nodejs_compat for the server middleware's AsyncLocalStorage", async () => {
    const nitro = await generateVfs(
      baseConfig({ backend: "nitro", runtime: "workers", serverDeploy: "cloudflare" }),
    );
    const nitroConfig = nitro.readFile("apps/server/nitro.config.ts") ?? "";
    expect(nitroConfig).toContain("nodeCompat: true");
    expect(nitro.exists("apps/server/server/middleware/locale.ts")).toBe(true);

    const hono = await generateVfs(
      baseConfig({ backend: "hono", runtime: "workers", serverDeploy: "cloudflare" }),
    );
    const alchemy = hono.readFile("packages/infra/alchemy.run.ts") ?? "";
    expect(alchemy).toContain('flags: ["nodejs_compat"]');
  });
});
