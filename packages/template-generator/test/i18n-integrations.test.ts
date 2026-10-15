import { describe, expect, spyOn, test } from "bun:test";

import type { ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../src/core/virtual-fs";
import {
  processI18nIntegrations,
  processI18nIntegrationTemplates,
} from "../src/processors/i18n/integrations";
import type { TemplateData } from "../src/template-handlers/utils";

/**
 * Focused coverage for the built-in localization integrations (task 7.12):
 * every integration adds files and dependencies only when its `when()` in
 * `packages/types/src/i18n.ts` holds. Stubs carry the same anchors the real
 * generated files do; the shared `getI18nIntegrations` map drives the runs.
 */

const TEMPLATES: TemplateData = new Map([
  ["i18n/integrations/clerk/clerk-client.ts.hbs", "clerk-client"],
  ["i18n/integrations/clerk/clerk-localization-provider.tsx.hbs", "clerk-provider-web"],
  ["i18n/integrations/clerk/clerk-localization-provider.native.tsx.hbs", "clerk-provider-native"],
  ["i18n/integrations/zod/zod-client.ts.hbs", "zod-client"],
  ["i18n/integrations/nuxt/use-ui-locale.ts.hbs", "ui-locale"],
  ["i18n/integrations/fumadocs/lib/i18n.ts.hbs", "fumadocs-i18n"],
  ["i18n/integrations/wxt/sync-wxt.ts.hbs", "sync-wxt"],
  ["i18n/integrations/expo/device-locale.ts.hbs", "device-locale"],
  ["i18n/integrations/turnstile/turnstile.ts.hbs", "turnstile-language"],
]);

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["tanstack-router"],
    addons: ["turborepo"],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "lingui",
    git: true,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "none",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

function run(vfs: VirtualFileSystem, config: ProjectConfig): void {
  processI18nIntegrationTemplates(vfs, TEMPLATES, config);
  processI18nIntegrations(vfs, config);
}

function withFiles(files: Readonly<Record<string, string>>): VirtualFileSystem {
  const vfs = new VirtualFileSystem();
  for (const [path, content] of Object.entries(files)) vfs.writeFile(path, content);
  return vfs;
}

const AUTH_SERVER_STUB = [
  'import { betterAuth } from "better-auth";',
  "",
  "export function createAuth(env: AuthConfig) {",
  "  return betterAuth({",
  "    emailAndPassword: { enabled: true },",
  "    plugins: [",
  "    ],",
  "  });",
  "}",
  "",
].join("\n");

const DRIZZLE_AUTH_SCHEMA_STUB = [
  'export const user = pgTable("user", {',
  '  id: text("id").primaryKey(),',
  '  image: text("image"),',
  '  createdAt: timestamp("created_at").defaultNow().notNull(),',
  "});",
  "",
].join("\n");

const CLERK_LAYOUT_STUB = [
  'import { ClerkProvider } from "@clerk/nextjs";',
  'import Providers from "@/components/providers";',
  "",
  "export default function RootLayout({ children }: { children: React.ReactNode }) {",
  "  return (",
  '    <html lang="en">',
  "      <body>",
  "        <ClerkProvider>",
  "          <Providers>{children}</Providers>",
  "        </ClerkProvider>",
  "      </body>",
  "    </html>",
  "  );",
  "}",
  "",
].join("\n");

const LINGUI_RUNTIME_STUB = [
  'import type { Messages } from "@lingui/core";',
  "",
  "export async function activateLocale(locale: string): Promise<void> {",
  "  i18n.load(locale, {});",
  "  i18n.activate(locale);",
  "}",
  "",
].join("\n");

const PARAGLIDE_RUNTIME_STUB = [
  "/**",
  " * Paraglide runtime for `@demo/i18n`.",
  " */",
  "",
  'export { m } from "./paraglide/messages.js";',
  'export * from "./paraglide/runtime.js";',
  'export { paraglideMiddleware } from "./paraglide/server.js";',
  "",
].join("\n");

const NUXT_APP_VUE_STUB = [
  '<script setup lang="ts">',
  "</script>",
  "",
  "<template>",
  "    <UApp>",
  "        <NuxtPage />",
  "    </UApp>",
  "</template>",
  "",
].join("\n");

const NUXT_CONFIG_STUB = [
  "export default defineNuxtConfig({",
  "  compatibilityDate: 'latest',",
  "  modules: [",
  "    '@nuxt/ui'",
  "  ],",
  "  css: ['~/assets/css/main.css'],",
  "})",
  "",
].join("\n");

const ASTRO_CONFIG_STUB = [
  'import { defineConfig } from "astro/config";',
  "",
  "export default defineConfig({",
  "  vite: { plugins: [] },",
  "});",
  "",
].join("\n");

const STARLIGHT_CONFIG_STUB = [
  'import starlight from "@astrojs/starlight";',
  "",
  "export default defineConfig({",
  '  integrations: [starlight({ title: "Docs" })],',
  "});",
  "",
].join("\n");

const FUMADOCS_SOURCE_STUB = [
  'import { loader } from "fumadocs-core/source";',
  'import { docs } from "./source.config";',
  "",
  "export const source = loader({",
  '  baseUrl: "/docs",',
  "  docs: docs.toFumadocsSource(),",
  "});",
  "",
].join("\n");

const NATIVE_LAYOUT_STUB = [
  'import { Stack } from "expo-router";',
  "",
  "export default function Layout() {",
  "  return <Stack />;",
  "}",
  "",
].join("\n");

const LINGUI_PROVIDER_STUB = [
  'import { I18nProvider as LinguiI18nProvider } from "@lingui/react";',
  "",
  "export function I18nProvider({ children }: { children: React.ReactNode }) {",
  "  useEffect(() => {",
  "    void initializeLocale({",
  "      system: Intl.DateTimeFormat().resolvedOptions().locale,",
  "    });",
  "  }, []);",
  "",
  "  return <LinguiI18nProvider>{children}</LinguiI18nProvider>;",
  "}",
  "",
].join("\n");

const POLAR_PAYMENTS_LIB_STUB = [
  'import { Polar } from "@polar-sh/sdk";',
  "",
  "export function createPolarClient(config: { POLAR_ACCESS_TOKEN: string }) {",
  '  return new Polar({ accessToken: config.POLAR_ACCESS_TOKEN, server: "sandbox" });',
  "}",
  "",
].join("\n");

const STRIPE_PAYMENTS_LIB_STUB = [
  'import { authClient } from "@/lib/auth-client";',
  "",
  "export async function checkout(): Promise<void> {",
  "  const { error } = await authClient.subscription.upgrade({",
  '    plan: "pro",',
  '    successUrl: "/success",',
  '    cancelUrl: "/dashboard",',
  "  });",
  "  if (error) return;",
  "}",
  "",
].join("\n");

const POLAR_CONVEX_DASHBOARD_STUB = [
  '"use client";',
  "",
  'import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";',
  "",
  "function DashboardContent() {",
  "  return (",
  "    <CheckoutLink",
  "      polarApi={api.polar}",
  "      productIds={[product.id]}",
  "      embed={false}",
  "    >",
  "      Upgrade",
  "    </CheckoutLink>",
  "  );",
  "}",
  "",
].join("\n");

describe("better-auth-i18n", () => {
  const files = {
    "packages/auth/package.json": JSON.stringify({ name: "@demo/auth" }),
    "packages/auth/src/index.ts": AUTH_SERVER_STUB,
    "packages/db/src/schema/auth.ts": DRIZZLE_AUTH_SCHEMA_STUB,
    "packages/i18n/package.json": JSON.stringify({ name: "@demo/i18n" }),
  };

  test("patches the auth server and user schema when auth is better-auth", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ auth: "better-auth" }));

    const server = vfs.readFile("packages/auth/src/index.ts") ?? "";
    expect(server).toContain('from "@better-auth/i18n"');
    expect(server).toContain(
      "const betterAuthI18nTranslations: Record<string, TranslationDictionary>",
    );
    expect(server).toContain("i18n({");
    expect(server).toContain("translations: betterAuthI18nTranslations,");
    expect(server).toContain('detection: ["callback", "session", "cookie", "header"]');
    expect(server).toContain('userLocaleField: "locale"');
    expect(server).toContain("user: {");
    expect(server).toContain('locale: { type: "string", required: false }');
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("packages/auth/package.json")
        ?.dependencies?.["@better-auth/i18n"],
    ).toBeDefined();
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("packages/auth/package.json")
        ?.dependencies?.["@demo/i18n"],
    ).toBeDefined();
    expect(vfs.readFile("packages/db/src/schema/auth.ts")).toContain('locale: text("locale"),');
  });

  test("adds nothing when auth is none", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ auth: "none" }));

    expect(vfs.readFile("packages/auth/src/index.ts")).toBe(AUTH_SERVER_STUB);
    expect(vfs.readFile("packages/db/src/schema/auth.ts")).toBe(DRIZZLE_AUTH_SCHEMA_STUB);
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("packages/auth/package.json")
        ?.dependencies,
    ).toBeUndefined();
  });

  test("adds the locale field to the Prisma MySQL schema", () => {
    const prismaStub =
      "model User {\n  id            String    @id\n  image         String?   @db.Text\n  createdAt     DateTime  @default(now())\n}\n";
    const vfs = withFiles({
      "packages/auth/package.json": JSON.stringify({ name: "@demo/auth" }),
      "packages/auth/src/index.ts": AUTH_SERVER_STUB,
      "packages/db/prisma/schema/auth.prisma": prismaStub,
    });
    run(vfs, baseConfig({ auth: "better-auth" }));

    expect(vfs.readFile("packages/db/prisma/schema/auth.prisma")).toBe(
      prismaStub.replace(
        "  image         String?   @db.Text\n",
        "  image         String?   @db.Text\n  locale String?\n",
      ),
    );
  });

  test("warns for locales without a built-in translation", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const vfs = withFiles(files);
    run(
      vfs,
      baseConfig({
        auth: "better-auth",
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "xx"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"xx"'));
    expect(warn.mock.calls.some(([message]) => String(message).includes("better-auth-i18n"))).toBe(
      true,
    );
    warn.mockRestore();
  });
});

describe("clerk-localizations", () => {
  const files = {
    "packages/i18n/package.json": JSON.stringify({ name: "@demo/i18n" }),
    "apps/web/src/app/layout.tsx": CLERK_LAYOUT_STUB,
  };

  test("patches the provider and adds @clerk/localizations when auth is clerk", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ auth: "clerk", frontend: ["next"] }));

    const layout = vfs.readFile("apps/web/src/app/layout.tsx") ?? "";
    expect(layout).toContain("<ClerkLocalizationProvider>");
    expect(layout).toContain("</ClerkLocalizationProvider>");
    expect(layout).toContain(
      'import { ClerkLocalizationProvider } from "@/components/clerk-localization-provider";',
    );
    expect(layout).not.toContain("import { ClerkProvider }");
    expect(vfs.exists("apps/web/src/components/clerk-localization-provider.tsx")).toBe(true);
    expect(vfs.exists("packages/i18n/src/integrations/clerk-client.ts")).toBe(true);
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("packages/i18n/package.json")
        ?.dependencies?.["@clerk/localizations"],
    ).toBeDefined();
  });

  test("adds nothing when auth is not clerk", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ auth: "better-auth", frontend: ["next"] }));

    expect(vfs.readFile("apps/web/src/app/layout.tsx")).toBe(CLERK_LAYOUT_STUB);
    expect(vfs.exists("apps/web/src/components/clerk-localization-provider.tsx")).toBe(false);
    expect(vfs.exists("packages/i18n/src/integrations/clerk-client.ts")).toBe(false);
  });

  test("patches providers from the derived surfaces, not the frontend list", () => {
    const vfs = withFiles({
      "packages/i18n/package.json": JSON.stringify({ name: "@demo/i18n" }),
      "apps/web/src/root.tsx": CLERK_LAYOUT_STUB,
    });
    run(vfs, baseConfig({ auth: "clerk", frontend: ["svelte"] }));

    expect(vfs.readFile("apps/web/src/root.tsx")).toBe(CLERK_LAYOUT_STUB);
    expect(vfs.exists("apps/web/src/components/clerk-localization-provider.tsx")).toBe(false);
    expect(vfs.exists("packages/i18n/src/integrations/clerk-client.ts")).toBe(true);
  });
});

describe("zod-locales", () => {
  const files = {
    "packages/i18n/package.json": JSON.stringify({ name: "@demo/i18n" }),
    "packages/i18n/src/runtime.ts": LINGUI_RUNTIME_STUB,
  };

  test("wires z.config on the client when an API or auth consumer exists", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ api: "trpc" }));

    const runtime = vfs.readFile("packages/i18n/src/runtime.ts") ?? "";
    expect(runtime).toContain('import { applyZodLocale } from "./integrations/zod-client";');
    expect(runtime).toContain("await applyZodLocale(locale);");
    expect(vfs.exists("packages/i18n/src/integrations/zod-client.ts")).toBe(true);
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("packages/i18n/package.json")
        ?.dependencies?.zod,
    ).toBeDefined();
  });

  test("does not touch the runtime when no consumer imports zod", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ api: "none", auth: "none" }));

    expect(vfs.readFile("packages/i18n/src/runtime.ts")).toBe(LINGUI_RUNTIME_STUB);
    expect(vfs.exists("packages/i18n/src/integrations/zod-client.ts")).toBe(false);
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("packages/i18n/package.json")
        ?.dependencies,
    ).toBeUndefined();
  });

  test("injects the zod and paraglide imports above the runtime body for a re-export-only module", () => {
    const vfs = withFiles({
      "packages/i18n/package.json": JSON.stringify({ name: "@demo/i18n" }),
      "packages/i18n/src/runtime.ts": PARAGLIDE_RUNTIME_STUB,
    });
    run(vfs, baseConfig({ i18n: "paraglide", api: "trpc" }));

    const runtime = vfs.readFile("packages/i18n/src/runtime.ts") ?? "";
    // The Paraglide runtime has no `import` lines, only re-exports; the injected
    // imports must land after the leading JSDoc block, not inside it.
    expect(
      runtime.indexOf('import { applyZodLocale } from "./integrations/zod-client";'),
    ).toBeGreaterThan(runtime.indexOf("*/"));
    expect(
      runtime.indexOf(
        'import { setLocale as applyParaglideLocale } from "./paraglide/runtime.js";',
      ),
    ).toBeGreaterThan(runtime.indexOf("*/"));
    expect(runtime).toContain("export async function setLocale(locale: ParaglideLocale)");
  });
});

describe("nuxt integrations", () => {
  const files = {
    "apps/web/package.json": JSON.stringify({ name: "web" }),
    "apps/web/app/app.vue": NUXT_APP_VUE_STUB,
    "apps/web/nuxt.config.ts": NUXT_CONFIG_STUB,
  };

  test("adds @nuxtjs/i18n and binds the Nuxt UI locale when the nuxt surface exists", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ frontend: ["nuxt"] }));

    const config = vfs.readFile("apps/web/nuxt.config.ts") ?? "";
    expect(config).toContain("'@nuxtjs/i18n'");
    expect(config).toContain("i18n: {");
    expect(config).toContain('defaultLocale: "en"');
    expect(config).toContain('strategy: "no_prefix"');

    const app = vfs.readFile("apps/web/app/app.vue") ?? "";
    expect(app).toContain('<UApp :locale="uiLocale">');
    expect(app).toContain("const uiLocale = useUiLocale();");
    expect(vfs.exists("apps/web/app/composables/use-ui-locale.ts")).toBe(true);
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("apps/web/package.json")
        ?.dependencies?.["@nuxtjs/i18n"],
    ).toBeDefined();
  });

  test("prefix routing maps to the Nuxt i18n strategy", () => {
    const vfs = withFiles(files);
    run(
      vfs,
      baseConfig({
        frontend: ["nuxt"],
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: { strategy: "prefix", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    const config = vfs.readFile("apps/web/nuxt.config.ts") ?? "";
    expect(config).toContain('strategy: "prefix_except_default"');
    expect(config).toContain('redirectOn: "root"');
  });

  test("adds nothing without the nuxt surface", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ frontend: ["next"] }));

    expect(vfs.readFile("apps/web/nuxt.config.ts")).toBe(NUXT_CONFIG_STUB);
    expect(vfs.readFile("apps/web/app/app.vue")).toBe(NUXT_APP_VUE_STUB);
    expect(vfs.exists("apps/web/app/composables/use-ui-locale.ts")).toBe(false);
  });
});

describe("astro-i18n-routing", () => {
  test("adds the Astro i18n config for the astro surface", () => {
    const vfs = withFiles({ "apps/web/astro.config.mjs": ASTRO_CONFIG_STUB });
    run(vfs, baseConfig({ frontend: ["astro"] }));

    const config = vfs.readFile("apps/web/astro.config.mjs") ?? "";
    expect(config).toContain("i18n: {");
    expect(config).toContain('defaultLocale: "en"');
    expect(config).toContain('"en", "es", "fr"');
  });

  test("adds nothing without the astro surface", () => {
    const vfs = withFiles({ "apps/web/astro.config.mjs": ASTRO_CONFIG_STUB });
    run(vfs, baseConfig({ frontend: ["next"] }));

    expect(vfs.readFile("apps/web/astro.config.mjs")).toBe(ASTRO_CONFIG_STUB);
  });
});

describe("starlight-i18n", () => {
  test("patches the Starlight config when the docs app exists", () => {
    const vfs = withFiles({ "apps/docs/astro.config.mjs": STARLIGHT_CONFIG_STUB });
    run(vfs, baseConfig({ addons: ["turborepo", "starlight"] }));

    const config = vfs.readFile("apps/docs/astro.config.mjs") ?? "";
    expect(config).toContain('defaultLocale: "en"');
    expect(config).toContain('root: { label: "English", lang: "en" }');
    expect(config).toContain('fr: { label: "Français", lang: "fr" }');
  });

  test("is a no-op on the Create Path (the scaffolder creates apps/docs later)", () => {
    const vfs = new VirtualFileSystem();
    run(vfs, baseConfig({ addons: ["turborepo", "starlight"] }));

    expect(vfs.getAllFiles()).toHaveLength(0);
  });
});

describe("fumadocs-i18n", () => {
  const files = {
    "apps/fumadocs/package.json": JSON.stringify({ name: "fumadocs" }),
    "apps/fumadocs/lib/source.ts": FUMADOCS_SOURCE_STUB,
  };

  test("emits lib/i18n.ts and wires the loader when the app exists", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ addons: ["turborepo", "fumadocs"] }));

    expect(vfs.exists("apps/fumadocs/lib/i18n.ts")).toBe(true);
    const source = vfs.readFile("apps/fumadocs/lib/source.ts") ?? "";
    expect(source).toContain('import { i18n } from "@/lib/i18n";');
    expect(source).toContain("loader({");
    expect(source).toContain("i18n,");
  });

  test("adds nothing without the fumadocs addon", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ addons: ["turborepo"] }));

    expect(vfs.exists("apps/fumadocs/lib/i18n.ts")).toBe(false);
    expect(vfs.readFile("apps/fumadocs/lib/source.ts")).toBe(FUMADOCS_SOURCE_STUB);
  });
});

describe("pwa-manifest-lang", () => {
  const frOptions = {
    sourceLocale: "fr",
    locales: ["en", "fr"],
    routing: { strategy: "cookie" as const, prefixDefaultLocale: false },
    translateSkill: true,
  };

  test("sets lang and the shared direction helper on the Next manifest", () => {
    const vfs = withFiles({
      "apps/web/src/app/manifest.ts":
        'import type { MetadataRoute } from "next";\n\nexport default function manifest(): MetadataRoute.Manifest {\n\treturn {\n\t\tname: "demo",\n\t};\n}\n',
    });
    run(
      vfs,
      baseConfig({ addons: ["turborepo", "pwa"], frontend: ["next"], i18nOptions: frOptions }),
    );

    const manifest = vfs.readFile("apps/web/src/app/manifest.ts") ?? "";
    expect(manifest).toContain('import { getTextDirection } from "@demo/i18n/config";');
    expect(manifest).toContain('lang: "fr"');
    expect(manifest).toContain('dir: getTextDirection("fr")');
  });

  test("injects lang into the static site.webmanifest at a unique anchor", () => {
    const stub = '{\n\t"name": "demo",\n\t"short_name": "demo",\n\t"icons": [],\n}\n';
    const vfs = withFiles({ "apps/web/public/favicon/site.webmanifest": stub });
    run(
      vfs,
      baseConfig({ addons: ["turborepo", "pwa"], frontend: ["next"], i18nOptions: frOptions }),
    );

    expect(vfs.readFile("apps/web/public/favicon/site.webmanifest")).toBe(
      '{\n\t"name": "demo",\n\t"lang": "fr",\n\t"short_name": "demo",\n\t"icons": [],\n}\n',
    );
  });

  test("adds nothing without the pwa addon", () => {
    const stub =
      'import type { MetadataRoute } from "next";\n\nexport default function manifest(): MetadataRoute.Manifest {\n\treturn {\n\t\tname: "demo",\n\t};\n}\n';
    const vfs = withFiles({ "apps/web/src/app/manifest.ts": stub });
    run(vfs, baseConfig({ frontend: ["next"] }));

    expect(vfs.readFile("apps/web/src/app/manifest.ts")).toBe(stub);
  });
});

describe("wxt-i18n", () => {
  const baseFiles = {
    "package.json": JSON.stringify({ name: "demo", scripts: {} }),
    "packages/i18n/package.json": JSON.stringify({ name: "@demo/i18n", scripts: {} }),
  };

  test("emits the sync script and registers i18n:sync-wxt for wxt surfaces", () => {
    const vfs = withFiles(baseFiles);
    run(vfs, baseConfig({ addons: ["turborepo", "wxt"] }));

    expect(vfs.exists("packages/i18n/scripts/sync-wxt.ts")).toBe(true);
    expect(
      vfs.readJson<{ scripts?: Record<string, string> }>("packages/i18n/package.json")?.scripts?.[
        "i18n:sync-wxt"
      ],
    ).toBe("bun run scripts/export.ts && bun run scripts/sync-wxt.ts");
    expect(
      vfs.readJson<{ scripts?: Record<string, string> }>("package.json")?.scripts?.[
        "i18n:sync-wxt"
      ],
    ).toBe("turbo run i18n:sync-wxt -F @demo/i18n --");
  });

  test("adds the dependency and patches wxt.config.ts only when the extension app exists", () => {
    const vfs = withFiles({
      ...baseFiles,
      "apps/extension/package.json": JSON.stringify({ name: "extension" }),
      "apps/extension/wxt.config.ts":
        'export default defineConfig({\n  manifest: {\n    name: "demo",\n  },\n});\n',
    });
    run(vfs, baseConfig({ addons: ["turborepo", "wxt"] }));

    const config = vfs.readFile("apps/extension/wxt.config.ts") ?? "";
    expect(config).toContain('modules: ["@wxt-dev/i18n/module"]');
    expect(config).toContain('default_locale: "en"');
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("apps/extension/package.json")
        ?.dependencies?.["@wxt-dev/i18n"],
    ).toBeDefined();
  });

  test("adds nothing without a wxt surface", () => {
    const vfs = withFiles(baseFiles);
    run(vfs, baseConfig({ addons: ["turborepo"] }));

    expect(vfs.exists("packages/i18n/scripts/sync-wxt.ts")).toBe(false);
    expect(
      vfs.readJson<{ scripts?: Record<string, string> }>("package.json")?.scripts?.[
        "i18n:sync-wxt"
      ],
    ).toBeUndefined();
  });
});

describe("expo-localization", () => {
  const files = {
    "apps/native/package.json": JSON.stringify({ name: "native" }),
    "apps/native/app/_layout.tsx": NATIVE_LAYOUT_STUB,
    "apps/native/components/i18n-provider.tsx": LINGUI_PROVIDER_STUB,
  };

  test("emits the device locale, Intl polyfills and dependencies for native surfaces", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ frontend: ["native-uniwind"] }));

    expect(vfs.exists("apps/native/lib/device-locale.ts")).toBe(true);
    const polyfills = vfs.readFile("apps/native/polyfills/intl.ts") ?? "";
    expect(polyfills).toContain("@formatjs/intl-pluralrules/polyfill");
    // `./locale-data/*` maps to a literal path, so the `.js` extension is required
    // for the side-effect import to resolve to the emitted `locale-data/<lang>.js`.
    expect(polyfills).toContain("@formatjs/intl-pluralrules/locale-data/en.js");
    expect(polyfills).toContain("@formatjs/intl-pluralrules/locale-data/fr.js");

    const layout = vfs.readFile("apps/native/app/_layout.tsx") ?? "";
    expect(layout.startsWith('import "../polyfills/intl";')).toBe(true);

    const provider = vfs.readFile("apps/native/components/i18n-provider.tsx") ?? "";
    expect(provider).toContain("system: getDeviceLocaleTag(),");
    expect(provider).toContain('import { getDeviceLocaleTag } from "@/lib/device-locale";');

    const pkg = vfs.readJson<{ dependencies?: Record<string, string> }>("apps/native/package.json");
    expect(pkg?.dependencies?.["expo-localization"]).toBeDefined();
    expect(pkg?.dependencies?.["@formatjs/intl-locale"]).toBeDefined();
  });

  test("initializes the paraglide native demo from the device locale", () => {
    const demoStub = [
      'import { getLocale, locales, m, setLocale } from "@demo/i18n/runtime";',
      'import { Pressable, StyleSheet, Text, View } from "react-native";',
      "",
      "export function I18nDemo() {",
      "  const locale = getLocale();",
      "  return <View />;",
      "}",
      "",
    ].join("\n");
    const vfs = withFiles({
      "apps/native/package.json": JSON.stringify({ name: "native" }),
      "apps/native/components/i18n-demo.tsx": demoStub,
    });
    run(vfs, baseConfig({ frontend: ["native-bare"], i18n: "paraglide" }));

    const demo = vfs.readFile("apps/native/components/i18n-demo.tsx") ?? "";
    expect(demo).toContain('import { overwriteGetLocale } from "@demo/i18n/runtime";');
    expect(demo).toContain('import { getDeviceLocaleTag } from "@/lib/device-locale";');
    expect(demo).toContain('import { negotiateLocale } from "@demo/i18n/config";');
    expect(demo).toContain(
      "overwriteGetLocale(() => negotiateLocale({ system: getDeviceLocaleTag() }));",
    );
    expect(demo.indexOf("overwriteGetLocale(() =>")).toBeLessThan(
      demo.indexOf("export function I18nDemo()"),
    );
  });

  test("adds nothing without a native surface", () => {
    const vfs = withFiles(files);
    run(vfs, baseConfig({ frontend: ["next"] }));

    expect(vfs.exists("apps/native/lib/device-locale.ts")).toBe(false);
    expect(vfs.exists("apps/native/polyfills/intl.ts")).toBe(false);
    expect(vfs.readFile("apps/native/app/_layout.tsx")).toBe(NATIVE_LAYOUT_STUB);
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("apps/native/package.json")
        ?.dependencies,
    ).toBeUndefined();
  });
});

describe("payments-checkout-locale", () => {
  test("injects the request locale into the Polar client when a checkout locale is verified", () => {
    const vfs = withFiles({
      "packages/auth/package.json": JSON.stringify({ name: "@demo/auth" }),
      "packages/auth/src/lib/payments.ts": POLAR_PAYMENTS_LIB_STUB,
    });
    run(vfs, baseConfig({ auth: "better-auth", payments: "polar" }));

    const payments = vfs.readFile("packages/auth/src/lib/payments.ts") ?? "";
    expect(payments).toContain('import { getRequestLocale } from "@demo/i18n/server";');
    expect(payments).toContain("const checkouts = polar.checkouts;");
    expect(payments).toContain(
      "createCheckout({ locale: getRequestLocale(), ...params }, options)",
    );
    expect(payments).toContain("return polar;");
    expect(
      vfs.readJson<{ dependencies?: Record<string, string> }>("packages/auth/package.json")
        ?.dependencies?.["@demo/i18n"],
    ).toBeDefined();
  });

  test("passes the negotiated locale to the Polar CheckoutLink on Convex", () => {
    const vfs = withFiles({
      "apps/web/src/app/dashboard/page.tsx": POLAR_CONVEX_DASHBOARD_STUB,
    });
    run(vfs, baseConfig({ auth: "better-auth", payments: "polar", backend: "convex" }));

    const dashboard = vfs.readFile("apps/web/src/app/dashboard/page.tsx") ?? "";
    expect(dashboard).toContain('import { getClientLocale } from "@demo/i18n/client";');
    expect(dashboard).toContain("locale={getClientLocale()}");
  });

  test("passes the negotiated locale to the Stripe Checkout Session", () => {
    const vfs = withFiles({
      "apps/web/src/lib/payments.ts": STRIPE_PAYMENTS_LIB_STUB,
    });
    run(vfs, baseConfig({ auth: "better-auth", payments: "stripe", frontend: ["next"] }));

    const payments = vfs.readFile("apps/web/src/lib/payments.ts") ?? "";
    expect(payments).toContain('import { getClientLocale } from "@demo/i18n/client";');
    expect(payments).toContain('    plan: "pro",\n    locale: getClientLocale(),');
  });

  test("leaves providers without a verified checkout locale untouched", () => {
    for (const payments of ["autumn", "dodo", "creem", "chargebee", "commet"] as const) {
      const vfs = withFiles({
        "packages/auth/package.json": JSON.stringify({ name: "@demo/auth" }),
        "packages/auth/src/lib/payments.ts": POLAR_PAYMENTS_LIB_STUB,
        "apps/web/src/lib/payments.ts": STRIPE_PAYMENTS_LIB_STUB,
      });
      run(vfs, baseConfig({ auth: "better-auth", payments }));

      expect(vfs.readFile("packages/auth/src/lib/payments.ts")).toBe(POLAR_PAYMENTS_LIB_STUB);
      expect(vfs.readFile("apps/web/src/lib/payments.ts")).toBe(STRIPE_PAYMENTS_LIB_STUB);
    }
  });
});

describe("turnstile-language", () => {
  const helperPath = "packages/i18n/src/integrations/turnstile.ts";

  test("emits the Turnstile language helper only when the turnstile addon is selected", () => {
    const vfs = withFiles({});
    run(vfs, baseConfig({ addons: ["turborepo", "turnstile"] }));
    expect(vfs.readFile(helperPath)).toBe("turnstile-language");

    const withoutAddon = withFiles({});
    run(withoutAddon, baseConfig({ addons: ["turborepo"] }));
    expect(withoutAddon.exists(helperPath)).toBe(false);
  });
});

describe("integration gate", () => {
  test("writes nothing when i18n is none", () => {
    const vfs = withFiles({
      "package.json": JSON.stringify({ name: "demo", scripts: {} }),
      "packages/i18n/package.json": JSON.stringify({ name: "@demo/i18n", scripts: {} }),
      "apps/native/package.json": JSON.stringify({ name: "native" }),
    });
    run(
      vfs,
      baseConfig({
        i18n: "none",
        auth: "clerk",
        api: "trpc",
        frontend: ["next", "native-uniwind", "nuxt", "astro"],
        addons: ["turborepo", "pwa", "wxt", "starlight", "fumadocs"],
      }),
    );

    expect(vfs.exists("packages/i18n/src/integrations/clerk-client.ts")).toBe(false);
    expect(vfs.exists("packages/i18n/src/integrations/zod-client.ts")).toBe(false);
    expect(vfs.exists("packages/i18n/scripts/sync-wxt.ts")).toBe(false);
    expect(vfs.exists("apps/native/lib/device-locale.ts")).toBe(false);
    expect(
      vfs.readJson<{ scripts?: Record<string, string> }>("package.json")?.scripts?.[
        "i18n:sync-wxt"
      ],
    ).toBeUndefined();
  });
});
