import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { I18N_SUPPORT, type I18nSurface, type ProjectConfig } from "@better-t-stack/types";

import { processTemplateString } from "../src/core/template-processor";
import { VirtualFileSystem } from "../src/core/virtual-fs";
import {
  getWuchaleAdapterPlans,
  getWuchaleDeps,
  getWuchaleSurfaces,
} from "../src/processors/i18n/wuchale";
import { processI18nTemplates } from "../src/template-handlers/i18n";

const templatesDir = fileURLToPath(new URL("../templates/i18n", import.meta.url));
const configTemplate = readFileSync(`${templatesDir}/lib/wuchale/wuchale.config.mjs.hbs`, "utf8");

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["svelte"],
    addons: ["turborepo"],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "wuchale",
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

function renderConfig(config: ProjectConfig): string {
  return processTemplateString(configTemplate, config);
}

describe("wuchale surface support", () => {
  test("keeps only surfaces the matrix marks as supported", () => {
    const surfaces = getWuchaleSurfaces(baseConfig({ frontend: ["next", "native-uniwind"] }));
    expect(surfaces).toContain("next");
    expect(surfaces).not.toContain("native");

    expect(getWuchaleSurfaces(baseConfig({ frontend: ["nuxt"], backend: "none" }))).toEqual([]);
    expect(
      getWuchaleSurfaces(baseConfig({ frontend: ["solid"], backend: "none", addons: ["tauri"] })),
    ).toEqual(["solid"]);
    expect(
      getWuchaleSurfaces(baseConfig({ frontend: ["solid"], backend: "none", addons: ["wxt"] })),
    ).toEqual(["solid", "wxt-react"]);
    expect(
      getWuchaleSurfaces(
        baseConfig({
          frontend: [],
          backend: "none",
          addons: ["wxt"],
          addonOptions: { wxt: { template: "vue" } },
        }),
      ),
    ).toEqual([]);
  });

  test("groups surfaces into one adapter plan per app", () => {
    const plans = getWuchaleAdapterPlans(
      baseConfig({
        frontend: ["svelte"],
        addons: ["turborepo", "wxt", "electrobun"],
        addonOptions: { wxt: { template: "react" } },
      }),
    );

    const byKey = new Map(plans.map((plan) => [plan.key, plan]));
    expect([...byKey.keys()].sort()).toEqual(["desktop", "extension", "server", "web"]);
    expect(byKey.get("web")?.adapterPackage).toBe("@wuchale/svelte");
    expect(byKey.get("extension")?.adapterPackage).toBe("@wuchale/jsx");
    expect(byKey.get("server")?.adapterPackage).toBe("wuchale");
    expect(byKey.get("server")?.appPackagePath).toBe("apps/server/package.json");
  });
});

describe("wuchale config template", () => {
  test("configures the svelte adapter with scoped globs, per-adapter storage and no ai entry", () => {
    const rendered = renderConfig(baseConfig());

    expect(rendered).toContain('import { adapter as svelte } from "@wuchale/svelte";');
    expect(rendered).toContain('loader: "sveltekit"');
    expect(rendered).toContain('"../../apps/web/src/**/*.svelte"');
    expect(rendered).toContain('pofile({ location: "locales/web.{locale}.po" })');
    expect(rendered).toContain('localesDir: "../../apps/web/src/locales"');
    expect(rendered).toContain('localesDir: "./locales"');
    expect(rendered).not.toMatch(/\bai\s*:/);
    expect(rendered).not.toContain("@wuchale/jsx");
  });

  test("picks one web adapter: react frameworks, then svelte, solid and astro", () => {
    const next = renderConfig(baseConfig({ frontend: ["next"] }));
    expect(next).toContain('import { adapter as jsx } from "@wuchale/jsx";');
    expect(next).toContain('loader: "react"');
    expect(next).toContain('include: ["../../apps/web/src/**/*.{js,ts,jsx,tsx}"]');

    const solid = renderConfig(baseConfig({ frontend: ["solid"] }));
    expect(solid).toContain('loader: "solidjs"');
    expect(solid).toContain('variant: "solidjs"');

    const astro = renderConfig(baseConfig({ frontend: ["astro"] }));
    expect(astro).toContain('import { adapter as astro } from "@wuchale/astro";');
    expect(astro).toContain('include: ["../../apps/web/src/**/*.astro"]');
  });

  test("emits no web adapter for an unsupported frontend", () => {
    const rendered = renderConfig(baseConfig({ frontend: ["nuxt"], backend: "none" }));
    expect(rendered).not.toContain("web:");
    expect(rendered).not.toMatch(/\bai\s*:/);
  });

  test("configures the server, desktop, tui and extension adapters only when present", () => {
    const rendered = renderConfig(
      baseConfig({
        frontend: ["solid"],
        addons: ["turborepo", "electrobun", "opentui", "wxt"],
      }),
    );

    expect(rendered).toContain("server: vanilla({");
    expect(rendered).toContain("desktop: vanilla({");
    // opentui defaults to the core (vanilla) template; wxt defaults to react.
    expect(rendered).toContain("tui: vanilla({");
    expect(rendered).toContain("extension: jsx({");
    expect(rendered).toContain('loader: "react",');
    expect(rendered).toContain('pofile({ location: "locales/extension.{locale}.po" })');
  });

  test("uses locale options from the shared i18n configuration", () => {
    const rendered = renderConfig(
      baseConfig({
        i18nOptions: {
          sourceLocale: "de",
          locales: ["de", "en"],
          routing: { strategy: "cookie" },
        },
      }),
    );
    expect(rendered).toContain('    "de",');
    expect(rendered).toContain('    "en",');
    expect(rendered).not.toContain('    "fr",');
  });
});

describe("wuchale dependencies", () => {
  test("adds the runtime and adapter packages and the workspace i18n dependency", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("packages/i18n/package.json", { name: "@demo/i18n", scripts: {} });
    vfs.writeJson("apps/web/package.json", { name: "web", scripts: {} });
    vfs.writeJson("apps/server/package.json", { name: "server", scripts: {} });

    getWuchaleDeps(vfs, baseConfig());

    const i18nPackage = vfs.readJson<Record<string, Record<string, string>>>(
      "packages/i18n/package.json",
    );
    expect(i18nPackage?.dependencies?.["wuchale"]).toBe("0.26.7");
    expect(i18nPackage?.dependencies?.["@wuchale/svelte"]).toBe("^0.21.4");

    const webPackage =
      vfs.readJson<Record<string, Record<string, string>>>("apps/web/package.json");
    expect(webPackage?.dependencies?.["@demo/i18n"]).toBe("workspace:*");
    expect(webPackage?.dependencies?.["@wuchale/svelte"]).toBe("^0.21.4");

    const serverPackage = vfs.readJson<Record<string, Record<string, string>>>(
      "apps/server/package.json",
    );
    expect(serverPackage?.dependencies?.["@demo/i18n"]).toBe("workspace:*");
    expect(serverPackage?.dependencies?.["wuchale"]).toBe("0.26.7");
  });

  test("wires the wuchale Vite plugin into the web app exactly once", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("packages/i18n/package.json", { name: "@demo/i18n", scripts: {} });
    vfs.writeJson("apps/web/package.json", { name: "web", scripts: {} });
    vfs.writeFile(
      "apps/web/vite.config.ts",
      `import { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [tailwindcss()],\n});\n`,
    );

    getWuchaleDeps(vfs, baseConfig());
    getWuchaleDeps(vfs, baseConfig());

    const updated = vfs.readFile("apps/web/vite.config.ts") ?? "";
    expect(updated).toContain('import { wuchale } from "wuchale/vite";');
    expect(updated.match(/wuchale\(\{ configPath/g)).toHaveLength(1);
    expect(updated).toContain('configPath: "../../packages/i18n/wuchale.config.mjs"');
  });

  test("wires the plugin inside a react-router arrow-function config", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("packages/i18n/package.json", { name: "@demo/i18n", scripts: {} });
    vfs.writeJson("apps/web/package.json", { name: "web", scripts: {} });
    vfs.writeFile(
      "apps/web/vite.config.ts",
      `import { defineConfig } from "vite";\n\nexport default defineConfig(({ command }) => ({\n  plugins: [tailwindcss()],\n}));\n`,
    );

    getWuchaleDeps(vfs, baseConfig({ frontend: ["react-router"] }));

    const updated = vfs.readFile("apps/web/vite.config.ts") ?? "";
    expect(updated).toContain("wuchale({ configPath");
  });

  test("does not wire the Vite plugin for Next.js", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("packages/i18n/package.json", { name: "@demo/i18n", scripts: {} });
    vfs.writeJson("apps/web/package.json", { name: "web", scripts: {} });
    vfs.writeFile(
      "apps/web/vite.config.ts",
      `import { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [] });\n`,
    );

    getWuchaleDeps(vfs, baseConfig({ frontend: ["next"] }));

    expect(vfs.readFile("apps/web/vite.config.ts")).not.toContain("wuchale/vite");
  });

  test("adds the Astro integration to the Astro config", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("packages/i18n/package.json", { name: "@demo/i18n", scripts: {} });
    vfs.writeJson("apps/web/package.json", { name: "web", scripts: {} });
    vfs.writeFile(
      "apps/web/astro.config.mjs",
      `import { defineConfig } from "astro/config";\n\nexport default defineConfig({\n  integrations: [],\n});\n`,
    );

    getWuchaleDeps(vfs, baseConfig({ frontend: ["astro"] }));

    const updated = vfs.readFile("apps/web/astro.config.mjs") ?? "";
    expect(updated).toContain('import { wuchale } from "@wuchale/astro/integration";');
    expect(updated).toContain("wuchale({ configPath:");
  });
});

describe("wuchale template layout", () => {
  const surfaceOrder: I18nSurface[] = [
    "next",
    "tanstack-start",
    "server",
    "native",
    "solid",
    "nuxt",
    "svelte",
    "astro",
    "tanstack-router",
    "react-router",
    "wxt-vanilla",
    "wxt-react",
    "wxt-vue",
    "wxt-solid",
    "wxt-svelte",
    "opentui-core",
    "opentui-react",
    "opentui-solid",
    "electrobun-host",
    "tauri-host",
    "email",
  ];

  test("ships glue for every supported surface in the standard order and none for unsupported ones", () => {
    const present = readdirSync(`${templatesDir}/surface/wuchale`).sort();
    const supported = surfaceOrder.filter(
      (surface) => I18N_SUPPORT.wuchale[surface].level !== "unsupported",
    );

    expect([...present].sort()).toEqual([...supported].sort());

    for (const surface of supported) {
      const files = readdirSync(`${templatesDir}/surface/wuchale/${surface}`, {
        recursive: true,
      }).filter((file) => statSync(`${templatesDir}/surface/wuchale/${surface}/${file}`).isFile());
      expect(files.length).toBeGreaterThan(0);
    }
    for (const surface of surfaceOrder.filter(
      (value) => I18N_SUPPORT.wuchale[value].level === "unsupported",
    )) {
      expect(existsSync(`${templatesDir}/surface/wuchale/${surface}`)).toBe(false);
    }
  });

  test("every supported site demo uses the shared formatters and runtime", () => {
    // Non-UI hosts format server-side and do not load catalogs in-process.
    const withoutRuntime = ["server", "email", "electrobun-host"];

    for (const surface of readdirSync(`${templatesDir}/surface/wuchale`)) {
      const dir = `${templatesDir}/surface/wuchale/${surface}`;
      const files = readdirSync(dir, { recursive: true })
        .map((file) => join(dir, file))
        .filter((file) => statSync(file).isFile());
      const contents = files.map((file) => readFileSync(file, "utf8")).join("\n");

      expect(contents).toContain("createFormatters");
      expect(contents).toContain('@{{projectName}}/i18n"');
      if (!withoutRuntime.includes(surface)) {
        expect(contents).toContain("@{{projectName}}/i18n/runtime");
      }
    }
  });

  test("emits library files into packages/i18n and surface glue into the app", async () => {
    const templates = new Map<string, string>([
      ["i18n/lib/wuchale/wuchale.config.mjs", "config"],
      ["i18n/lib/wuchale/scripts/extract.ts", "extract"],
      ["i18n/surface/wuchale/svelte/src/routes/i18n-demo/+page.svelte", "svelte-demo"],
      ["i18n/surface/wuchale/server/src/i18n-demo.ts", "server-demo"],
      ["i18n/surface/wuchale/wxt-vue/src/i18n-demo.ts", "wxt-vue-demo"],
    ]);

    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, templates, baseConfig({ addons: ["turborepo", "wxt"] }));

    expect(vfs.exists("packages/i18n/wuchale.config.mjs")).toBe(true);
    expect(vfs.exists("packages/i18n/scripts/extract.ts")).toBe(true);
    expect(vfs.exists("apps/web/src/routes/i18n-demo/+page.svelte")).toBe(true);
    expect(vfs.exists("apps/server/src/i18n-demo.ts")).toBe(true);
    // The active wxt default template is react, so the vue glue is untouched.
    expect(vfs.exists("apps/extension/src/i18n-demo.ts")).toBe(false);
  });
});
