import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../src/core/virtual-fs";
import { processI18nDeps } from "../src/processors/i18n-deps";
import { processAddonTemplates } from "../src/template-handlers/addons";
import { processBackendTemplates } from "../src/template-handlers/backend";
import { processBaseTemplate } from "../src/template-handlers/base";
import { processFrontendTemplates } from "../src/template-handlers/frontend";
import { processI18nTemplates } from "../src/template-handlers/i18n";
import type { TemplateData } from "../src/template-handlers/utils";

const BINARY_EXTENSIONS = new Set([
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".zip",
]);

function loadTemplates(): TemplateData {
  const root = path.join(import.meta.dir, "..", "templates");
  const templates: TemplateData = new Map();

  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory)) {
      const filePath = path.join(directory, entry);
      const key = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(filePath).isDirectory()) {
        walk(filePath, key);
        continue;
      }
      if (BINARY_EXTENSIONS.has(path.extname(entry))) continue;
      templates.set(key, readFileSync(filePath, "utf8"));
    }
  };

  walk(root, "");
  return templates;
}

const TEMPLATES = loadTemplates();

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "none",
    orm: "none",
    backend: "hono",
    runtime: "bun",
    frontend: ["tanstack-start"],
    addons: [],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "paraglide",
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

async function generateVfs(config: ProjectConfig): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem();
  await processBaseTemplate(vfs, TEMPLATES, config);
  await processFrontendTemplates(vfs, TEMPLATES, config);
  await processBackendTemplates(vfs, TEMPLATES, config);
  await processAddonTemplates(vfs, TEMPLATES, config);
  await processI18nTemplates(vfs, TEMPLATES, config);
  processI18nDeps(vfs, config);
  return vfs;
}

function readJson<T>(vfs: VirtualFileSystem, path: string): T {
  const value = vfs.readJson<T>(path);
  expect(value, `${path} should exist`).not.toBeUndefined();
  return value as T;
}

describe("paraglide shared package", () => {
  test("emits the inlang project, catalogs, runtime and the uniform scripts", async () => {
    const vfs = await generateVfs(baseConfig());

    const settings = readJson<{ baseLocale: string; locales: string[] }>(
      vfs,
      "packages/i18n/project.inlang/settings.json",
    );
    expect(settings.baseLocale).toBe("en");
    expect(settings.locales).toEqual(["en", "es", "fr"]);

    const config = vfs.readFile("packages/i18n/project.inlang/paraglide.config.mjs");
    expect(config).toContain('cookieName: "locale"');

    for (const locale of ["en", "es", "fr"]) {
      const catalog = readJson<Record<string, string>>(
        vfs,
        `packages/i18n/messages/${locale}.json`,
      );
      expect(catalog.i18n_demo_heading).toBeString();
      expect(catalog.i18n_demo_plural).toContain("plural");
    }

    expect(vfs.readFile("packages/i18n/src/runtime.ts")).toContain("./paraglide/messages.js");
    for (const script of ["extract", "compile", "pending", "apply", "check"]) {
      expect(vfs.exists(`packages/i18n/scripts/${script}.ts`)).toBe(true);
    }
  });

  test("uses the configured source locale and creates empty catalogs for new locales", async () => {
    const vfs = await generateVfs(
      baseConfig({
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "de"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    const settings = readJson<{ locales: string[] }>(
      vfs,
      "packages/i18n/project.inlang/settings.json",
    );
    expect(settings.locales).toEqual(["en", "de"]);

    const german = readJson<Record<string, string>>(vfs, "packages/i18n/messages/de.json");
    expect(Object.keys(german)).toEqual(["$schema"]);

    expect(vfs.exists("packages/i18n/messages/es.json")).toBe(false);
    expect(vfs.exists("packages/i18n/messages/fr.json")).toBe(false);
  });

  test("seeds a non-shipped source locale from the English catalog", async () => {
    const vfs = await generateVfs(
      baseConfig({
        i18nOptions: {
          sourceLocale: "de",
          locales: ["de", "en"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    const german = readJson<Record<string, string>>(vfs, "packages/i18n/messages/de.json");
    expect(german.i18n_demo_heading).toBeString();
  });
});

describe("paraglide Vite wiring", () => {
  test("adds the plugin with a per-app outdir to a Vite config", async () => {
    const vfs = await generateVfs(baseConfig({ frontend: ["tanstack-start"] }));

    const viteConfig = vfs.readFile("apps/web/vite.config.ts") as string;
    expect(viteConfig).toContain('from "@inlang/paraglide-js"');
    expect(viteConfig).toContain("paraglideVitePlugin({");
    expect(viteConfig).toContain('project: "../../packages/i18n/project.inlang"');
    expect(viteConfig).toContain('outdir: "./src/paraglide"');
  });

  test("wires every Vite frontend and its home route", async () => {
    const cases = [
      {
        frontend: "tanstack-start",
        page: "apps/web/src/routes/index.tsx",
        alias: "@/components",
        hook: "apps/web/src/hooks/use-format.ts",
      },
      {
        frontend: "tanstack-router",
        page: "apps/web/src/routes/index.tsx",
        alias: "@/components",
        hook: "apps/web/src/hooks/use-format.ts",
      },
      {
        frontend: "react-router",
        page: "apps/web/src/routes/_index.tsx",
        alias: "@/components",
        hook: "apps/web/src/hooks/use-format.ts",
      },
      {
        frontend: "solid",
        page: "apps/web/src/routes/index.tsx",
        alias: "~/components",
        hook: "apps/web/src/hooks/use-format.ts",
      },
    ] as const;

    for (const item of cases) {
      const vfs = await generateVfs(baseConfig({ frontend: [item.frontend] }));

      expect(vfs.readFile("apps/web/vite.config.ts")).toContain("paraglideVitePlugin(");
      expect(vfs.exists("apps/web/src/components/i18n-demo.tsx")).toBe(true);
      expect(vfs.exists(item.hook)).toBe(true);
      expect(vfs.readFile(item.hook)).toContain("useFormat");
      expect(vfs.readFile("apps/web/src/components/i18n-demo.tsx")).toContain("useFormat()");

      const page = vfs.readFile(item.page) as string;
      expect(page).toContain("<I18nDemo />");
      expect(page).toContain(`${item.alias}/i18n-demo`);
    }
  });

  test("follows the frontend handler when several React frameworks are selected", async () => {
    const vfs = await generateVfs(baseConfig({ frontend: ["tanstack-router", "next"] }));

    expect(vfs.exists("apps/web/next.config.ts")).toBe(false);
    expect(vfs.readFile("apps/web/src/routes/index.tsx")).toContain("<I18nDemo />");
  });
});

describe("paraglide Next wiring", () => {
  test("wraps next.config with the webpack plugin and enables --webpack", async () => {
    const vfs = await generateVfs(baseConfig({ frontend: ["next"] }));

    const nextConfig = vfs.readFile("apps/web/next.config.ts") as string;
    expect(nextConfig).toContain("paraglideWebpackPlugin");
    expect(nextConfig).toContain("webpack(config)");

    const pkg = readJson<{ scripts: Record<string, string> }>(vfs, "apps/web/package.json");
    expect(pkg.scripts.dev).toContain("--webpack");
    expect(pkg.scripts.build).toContain("--webpack");

    const page = vfs.readFile("apps/web/src/app/page.tsx") as string;
    expect(page).toContain("<I18nDemo />");
    expect(page).toContain('"@/components/i18n-demo"');

    expect(vfs.exists("apps/web/src/hooks/use-format.ts")).toBe(true);
    expect(vfs.readFile("apps/web/src/components/i18n-demo.tsx")).toContain("useFormat()");
  });
});

describe("paraglide Nuxt, Svelte and Astro wiring", () => {
  test("registers the plugin in nuxt vite.plugins and renders the auto-imported demo", async () => {
    const vfs = await generateVfs(baseConfig({ frontend: ["nuxt"] }));

    const nuxtConfig = vfs.readFile("apps/web/nuxt.config.ts") as string;
    expect(nuxtConfig).toContain("paraglideVitePlugin({");
    expect(nuxtConfig).toContain('outdir: "./app/paraglide"');

    expect(vfs.exists("apps/web/app/components/I18nDemo.vue")).toBe(true);
    expect(vfs.exists("apps/web/app/composables/useFormat.ts")).toBe(true);
    expect(vfs.readFile("apps/web/app/composables/useFormat.ts")).toContain("useFormat");
    expect(vfs.readFile("apps/web/app/components/I18nDemo.vue")).toContain("useFormat()");
    expect(vfs.readFile("apps/web/app/pages/index.vue")).toContain("<I18nDemo />");
  });

  test("registers the plugin in the SvelteKit config and renders the demo component", async () => {
    const vfs = await generateVfs(baseConfig({ frontend: ["svelte"] }));

    expect(vfs.readFile("apps/web/vite.config.ts")).toContain("paraglideVitePlugin(");
    expect(vfs.exists("apps/web/src/lib/components/i18n-demo.svelte")).toBe(true);
    expect(vfs.exists("apps/web/src/lib/use-format.svelte.ts")).toBe(true);
    expect(vfs.readFile("apps/web/src/lib/use-format.svelte.ts")).toContain("$derived");
    expect(vfs.readFile("apps/web/src/lib/components/i18n-demo.svelte")).toContain("useFormat()");

    const page = vfs.readFile("apps/web/src/routes/+page.svelte") as string;
    expect(page).toContain('import I18nDemo from "$lib/components/i18n-demo.svelte"');
    expect(page).toContain("<I18nDemo />");
  });

  test("registers the plugin in astro vite.plugins and renders the demo component", async () => {
    const vfs = await generateVfs(baseConfig({ frontend: ["astro"] }));

    expect(vfs.readFile("apps/web/astro.config.mjs")).toContain("paraglideVitePlugin(");
    expect(vfs.exists("apps/web/src/components/I18nDemo.astro")).toBe(true);

    const page = vfs.readFile("apps/web/src/pages/index.astro") as string;
    expect(page).toContain('import I18nDemo from "../components/I18nDemo.astro"');
    expect(page).toContain("<I18nDemo />");
  });
});

describe("paraglide host surfaces without a Vite pipeline", () => {
  test("wires the native app through the shared compile output", async () => {
    const vfs = await generateVfs(baseConfig({ frontend: ["native-uniwind"] }));

    expect(vfs.exists("apps/native/components/i18n-demo.tsx")).toBe(true);
    expect(vfs.exists("apps/native/hooks/use-format.ts")).toBe(true);
    expect(vfs.readFile("apps/native/components/i18n-demo.tsx")).toContain("useFormat()");
    const page = vfs.readFile("apps/native/app/(drawer)/index.tsx") as string;
    expect(page).toContain("<I18nDemo />");

    const pkg = readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    }>(vfs, "apps/native/package.json");
    expect(pkg.dependencies["@demo/i18n"]).toBe("workspace:*");
    expect(pkg.devDependencies["@inlang/paraglide-js"]).toBeString();
    expect(pkg.scripts["check-types"]).toContain("../../packages/i18n/src/paraglide");
  });

  test("mounts the demo endpoint for hono and nitro", async () => {
    const hono = await generateVfs(baseConfig({ backend: "hono" }));
    expect(hono.exists("apps/server/src/utils/i18n-demo.ts")).toBe(true);
    const honoEntry = hono.readFile("apps/server/src/index.ts") as string;
    expect(honoEntry).toContain('app.get("/i18n-demo"');
    expect(honoEntry).toContain('from "./utils/i18n-demo"');

    const nitro = await generateVfs(baseConfig({ backend: "nitro" }));
    const route = nitro.readFile("apps/server/server/routes/i18n-demo.get.ts") as string;
    expect(route).toContain("renderI18nDemo");
  });

  test("uses the demo from the Electrobun main process", async () => {
    const vfs = await generateVfs(baseConfig({ addons: ["electrobun", "turborepo"] }));

    expect(vfs.exists("apps/desktop/src/bun/i18n-demo.ts")).toBe(true);
    const entry = vfs.readFile("apps/desktop/src/bun/index.ts") as string;
    expect(entry).toContain('from "./i18n-demo"');
    expect(entry).toContain("renderI18nDemo()");
  });
});

describe("paraglide ignore patterns and scripts", () => {
  test("ignores the compiled output in .gitignore and biome.json", async () => {
    const plain = await generateVfs(baseConfig());
    const gitignore = plain.readFile(".gitignore") as string;
    expect(gitignore).toContain("apps/web/src/paraglide");
    expect(gitignore).toContain("packages/i18n/src/paraglide");

    const withBiome = await generateVfs(baseConfig({ addons: ["biome"] }));
    expect(withBiome.readFile("biome.json")).toContain("!**/paraglide");
  });

  test("prefixes check-types with the compile for the shared package and the web app", async () => {
    const vfs = await generateVfs(baseConfig());
    const i18nPkg = readJson<{ scripts: Record<string, string> }>(
      vfs,
      "packages/i18n/package.json",
    );
    expect(i18nPkg.scripts["check-types"]).toContain(
      "bunx @inlang/paraglide-js compile --project ./project.inlang",
    );

    const webPkg = readJson<{ scripts: Record<string, string> }>(vfs, "apps/web/package.json");
    expect(webPkg.scripts["check-types"]).toContain("--outdir ./src/paraglide");
  });

  test("does nothing when another library is selected", async () => {
    const vfs = await generateVfs(baseConfig({ i18n: "none" }));
    expect(vfs.exists("packages/i18n/project.inlang/settings.json")).toBe(false);
    expect(vfs.readFile("apps/web/vite.config.ts")).not.toContain("paraglideVitePlugin");
  });
});
