import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { ProjectConfig } from "@better-t-stack/types";

import { loadTemplates } from "../src/core/template-reader";
import { VirtualFileSystem } from "../src/core/virtual-fs";
import { getI18nextDeps } from "../src/processors/i18n/i18next";
import { processI18nTemplates } from "../src/template-handlers/i18n";
import { dependencyVersionMap } from "../src/utils/add-deps";
import {
  applyTranslations,
  checkCatalogs,
  collectPending,
  writeCatalog,
} from "../templates/i18n/lib/i18next/scripts/lib/catalogs";
import {
  IcuConversionError,
  exportCatalogEntries,
  importCatalogEntries,
  interpolationNames,
} from "../templates/i18n/lib/i18next/scripts/lib/icu";

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
    i18n: "i18next",
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

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function vfsWithPackages(paths: readonly string[]): VirtualFileSystem {
  const vfs = new VirtualFileSystem();
  vfs.writeJson("package.json", { name: "demo", scripts: {} });
  for (const path of paths) {
    vfs.writeJson(path, { name: path, dependencies: {}, devDependencies: {} });
  }
  return vfs;
}

const WEB = "apps/web/package.json";
const NATIVE = "apps/native/package.json";
const SERVER = "apps/server/package.json";
const DESKTOP = "apps/desktop/package.json";
const I18N_PACKAGE = "packages/i18n/package.json";

function readPackage(vfs: VirtualFileSystem, path: string): PackageJson {
  return vfs.readJson<PackageJson>(path) ?? {};
}

describe("getI18nextDeps", () => {
  test("adds the runtime and extractor to the shared package with pinned versions", () => {
    const vfs = vfsWithPackages([I18N_PACKAGE, WEB, SERVER]);
    getI18nextDeps(vfs, baseConfig());

    const pkg = readPackage(vfs, I18N_PACKAGE);
    expect(pkg.dependencies?.["i18next"]).toBe(dependencyVersionMap.i18next);
    expect(pkg.devDependencies?.["i18next-cli"]).toBe(dependencyVersionMap["i18next-cli"]);
    expect(pkg.devDependencies?.["@demo/config"]).toBe("workspace:*");
  });

  test("adds react-i18next to React web surfaces and i18next to the server", () => {
    const vfs = vfsWithPackages([I18N_PACKAGE, WEB, SERVER]);
    getI18nextDeps(vfs, baseConfig({ frontend: ["next"], backend: "hono" }));

    const web = readPackage(vfs, WEB);
    expect(web.dependencies?.["i18next"]).toBe(dependencyVersionMap.i18next);
    expect(web.dependencies?.["react-i18next"]).toBe(dependencyVersionMap["react-i18next"]);
    expect(web.dependencies?.["@demo/i18n"]).toBe("workspace:*");

    const server = readPackage(vfs, SERVER);
    expect(server.dependencies?.["@demo/i18n"]).toBe("workspace:*");
    expect(server.dependencies?.["i18next"]).toBe(dependencyVersionMap.i18next);
    expect(server.dependencies?.["react-i18next"]).toBeUndefined();
  });

  test("uses i18next-vue for nuxt and no React adapter", () => {
    const vfs = vfsWithPackages([I18N_PACKAGE, WEB]);
    getI18nextDeps(vfs, baseConfig({ frontend: ["nuxt"] }));

    const web = readPackage(vfs, WEB);
    expect(web.dependencies?.["i18next-vue"]).toBe(dependencyVersionMap["i18next-vue"]);
    expect(web.dependencies?.["react-i18next"]).toBeUndefined();
    expect(web.dependencies?.["i18next"]).toBe(dependencyVersionMap.i18next);
  });

  test("ships the framework glue without extra adapters for svelte and solid", () => {
    const vfs = vfsWithPackages([I18N_PACKAGE, WEB]);
    getI18nextDeps(vfs, baseConfig({ frontend: ["svelte"] }));
    const svelteWeb = readPackage(vfs, WEB);
    expect(svelteWeb.dependencies?.["i18next"]).toBe(dependencyVersionMap.i18next);
    expect(svelteWeb.dependencies?.["react-i18next"]).toBeUndefined();
    expect(svelteWeb.dependencies?.["i18next-vue"]).toBeUndefined();

    const solidVfs = vfsWithPackages([I18N_PACKAGE, WEB]);
    getI18nextDeps(solidVfs, baseConfig({ frontend: ["solid"] }));
    const solidWeb = readPackage(solidVfs, WEB);
    expect(solidWeb.dependencies?.["i18next"]).toBe(dependencyVersionMap.i18next);
    expect(solidWeb.dependencies?.["react-i18next"]).toBeUndefined();
  });

  test("wires native via react-i18next and the electrobun host via i18next", () => {
    const vfs = vfsWithPackages([I18N_PACKAGE, WEB, NATIVE, DESKTOP]);
    getI18nextDeps(vfs, baseConfig({ frontend: ["native-uniwind"], addons: ["electrobun"] }));

    expect(readPackage(vfs, NATIVE).dependencies?.["react-i18next"]).toBe(
      dependencyVersionMap["react-i18next"],
    );
    expect(readPackage(vfs, DESKTOP).dependencies?.["i18next"]).toBe(dependencyVersionMap.i18next);
  });

  test("leaves untouched when another library is selected", () => {
    const vfs = vfsWithPackages([I18N_PACKAGE, WEB, SERVER]);
    getI18nextDeps(vfs, baseConfig({ i18n: "lingui" }));

    expect(readPackage(vfs, I18N_PACKAGE).dependencies?.["i18next"]).toBeUndefined();
    expect(readPackage(vfs, WEB).dependencies?.["react-i18next"]).toBeUndefined();
  });

  test("seeds one catalog per configured locale from the source catalog", () => {
    const vfs = vfsWithPackages([I18N_PACKAGE, WEB]);
    vfs.writeFile(
      "packages/i18n/locales/en/common.json",
      `${JSON.stringify({ "i18n demo": "i18n demo" }, null, 2)}\n`,
    );

    getI18nextDeps(
      vfs,
      baseConfig({
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    expect(vfs.exists("packages/i18n/locales/fr/common.json")).toBe(true);
    expect(vfs.exists("packages/i18n/locales/es/common.json")).toBe(false);
    expect(vfs.readFile("packages/i18n/locales/fr/common.json")).toBe(
      vfs.readFile("packages/i18n/locales/en/common.json"),
    );
  });
});

describe("i18next templates", () => {
  test("emits the runtime, catalogs, scripts and per-surface glue", async () => {
    const templates = await loadTemplates("i18n");
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, templates, baseConfig({ frontend: ["next"] }));

    const runtime = vfs.readFile("packages/i18n/src/runtime.ts") ?? "";
    expect(runtime).toContain('import i18next from "i18next"');
    expect(runtime).toContain("keySeparator: false");
    expect(runtime).toContain("nsSeparator: false");
    expect(runtime).toContain('import catalog0 from "../locales/en/common.json"');
    expect(runtime).toContain("fr: { common: catalog2 }");

    const config = vfs.readFile("packages/i18n/i18next.config.ts") ?? "";
    expect(config).toContain('from "i18next-cli"');
    expect(config).toContain('"locales/{{language}}/{{namespace}}.json"');
    expect(config).toContain("keySeparator: false");
    // The extractor must not read dependency `.d.ts` files: the input globs are
    // relative to `packages/i18n`, so `node_modules` paths start with `../../`.
    expect(config).toContain('"../../**/node_modules/**"');
    expect(config).toContain('"../../node_modules/**"');

    const extract = vfs.readFile("packages/i18n/scripts/extract.ts") ?? "";
    expect(extract).toContain("i18next-cli");
    expect(extract).not.toContain("i18next-parser");

    expect(vfs.exists("packages/i18n/locales/en/common.json")).toBe(true);
    expect(vfs.exists("packages/i18n/scripts/pending.ts")).toBe(true);
    expect(vfs.exists("packages/i18n/scripts/apply.ts")).toBe(true);
    expect(vfs.exists("packages/i18n/scripts/check.ts")).toBe(true);
    expect(vfs.exists("packages/i18n/scripts/export.ts")).toBe(true);

    const glue = vfs.readFile("apps/web/src/i18n.ts") ?? "";
    expect(glue).toContain("initReactI18next");
    expect(glue).toContain("@demo/i18n/runtime");
    expect(glue).toContain("export function useFormat()");

    const demo = vfs.readFile("apps/web/src/app/i18n-demo/page.tsx") ?? "";
    expect(demo).toContain('t("Hello, {{name}}!", { name: "Ada" })');
    expect(demo).toContain("const formatters = useFormat();");
  });

  test("emits the nuxt plugin and page with literal Vue interpolation", async () => {
    const templates = await loadTemplates("i18n");
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, templates, baseConfig({ frontend: ["nuxt"] }));

    const plugin = vfs.readFile("apps/web/app/plugins/i18n.ts") ?? "";
    expect(plugin).toContain('from "i18next-vue"');
    expect(plugin).toContain("nuxtApp.vueApp.use(I18NextVue");

    const composable = vfs.readFile("apps/web/app/composables/use-format.ts") ?? "";
    expect(composable).toContain("export function useFormat()");
    expect(composable).toContain("createFormatters");

    const page = vfs.readFile("apps/web/app/pages/i18n-demo.vue") ?? "";
    expect(page).toContain(
      'const greeting = computed(() => t("Hello, {{name}}!", { name: "Ada" }));',
    );
    expect(page).toContain("{{ greeting }}");
    // Keys with i18next `{{placeholders}}` must live in the script: a literal
    // `}}` inside a Vue `{{ }}` mustache would close the interpolation early.
    expect(page).not.toContain('{{ t("Hello, {{name}}!"');
  });

  test("emits the shipped Svelte store and Solid primitive glue", async () => {
    const templates = await loadTemplates("i18n");

    const svelteVfs = new VirtualFileSystem();
    await processI18nTemplates(svelteVfs, templates, baseConfig({ frontend: ["svelte"] }));
    const store = svelteVfs.readFile("apps/web/src/lib/i18n.ts") ?? "";
    expect(store).toContain('from "svelte/store"');
    expect(store).toContain("export const format = derived(locale");
    const page = svelteVfs.readFile("apps/web/src/routes/i18n-demo/+page.svelte") ?? "";
    expect(page).toContain('{t("Hello, {{name}}!", { name: "Ada" })}');
    expect(page).toContain("const formatters = $format;");

    const solidVfs = new VirtualFileSystem();
    await processI18nTemplates(solidVfs, templates, baseConfig({ frontend: ["solid"] }));
    const primitive = solidVfs.readFile("apps/web/src/lib/i18n.tsx") ?? "";
    expect(primitive).toContain("createSignal");
    expect(primitive).toContain("getFixedT");
    expect(primitive).toContain("format: createMemo(() => createFormatters(locale()))");
    expect(solidVfs.exists("apps/web/src/routes/i18n-demo.tsx")).toBe(true);
  });

  test("emits glue for native, server, astro and the external-scaffolder surfaces", async () => {
    const templates = await loadTemplates("i18n");

    const nativeVfs = new VirtualFileSystem();
    await processI18nTemplates(nativeVfs, templates, baseConfig({ frontend: ["native-uniwind"] }));
    expect(nativeVfs.exists("apps/native/lib/i18n.ts")).toBe(true);
    expect(nativeVfs.exists("apps/native/app/i18n-demo.tsx")).toBe(true);

    const serverVfs = new VirtualFileSystem();
    await processI18nTemplates(serverVfs, templates, baseConfig({ backend: "nitro" }));
    expect(serverVfs.exists("apps/server/src/i18n.ts")).toBe(true);
    expect(serverVfs.exists("apps/server/src/i18n-demo.ts")).toBe(true);

    const astroVfs = new VirtualFileSystem();
    await processI18nTemplates(astroVfs, templates, baseConfig({ frontend: ["astro"] }));
    expect(astroVfs.exists("apps/web/src/lib/i18n.ts")).toBe(true);
    const astroPage = astroVfs.readFile("apps/web/src/pages/i18n-demo.astro") ?? "";
    expect(astroPage).toContain('t("Hello, {{name}}!", { name: "Ada" })');

    const wxtVfs = new VirtualFileSystem();
    await processI18nTemplates(
      wxtVfs,
      templates,
      baseConfig({ addons: ["wxt"], addonOptions: { wxt: { template: "svelte", devPort: 5555 } } }),
    );
    const wxtStore = wxtVfs.readFile("apps/extension/lib/i18n.ts") ?? "";
    expect(wxtStore).toContain('from "svelte/store"');
    expect(wxtVfs.exists("apps/extension/lib/i18n-demo.ts")).toBe(true);

    const tuiVfs = new VirtualFileSystem();
    await processI18nTemplates(
      tuiVfs,
      templates,
      baseConfig({ addons: ["opentui"], addonOptions: { opentui: { template: "react" } } }),
    );
    const tuiGlue = tuiVfs.readFile("apps/tui/src/i18n.ts") ?? "";
    expect(tuiGlue).toContain("initReactI18next");
  });

  test("emitted TypeScript surfaces parse (no stray braces)", async () => {
    const templates = await loadTemplates("i18n");
    const demos = {
      next: "apps/web/src/app/i18n-demo/page.tsx",
      "tanstack-start": "apps/web/src/routes/i18n-demo.tsx",
      "tanstack-router": "apps/web/src/routes/i18n-demo.tsx",
      "react-router": "apps/web/src/routes/i18n-demo.tsx",
      solid: "apps/web/src/routes/i18n-demo.tsx",
    } satisfies Record<string, string>;
    const transpiler = new Bun.Transpiler({ loader: "tsx" });

    for (const [frontend, demoPath] of Object.entries(demos)) {
      const vfs = new VirtualFileSystem();
      await processI18nTemplates(vfs, templates, baseConfig({ frontend: [frontend] }));
      const demo = vfs.readFile(demoPath);
      expect(demo).toBeDefined();
      expect(() => transpiler.transformSync(demo ?? "")).not.toThrow();
    }
  });

  test("packageRoot resolves the emitted scripts/lib layout", async () => {
    const templates = await loadTemplates("i18n");
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, templates, baseConfig());

    const root = mkdtempSync(join(tmpdir(), "i18next-package-root-"));
    try {
      const libDir = join(root, "packages", "i18n", "scripts", "lib");
      mkdirSync(libDir, { recursive: true });
      const catalogsSource = vfs.readFile("packages/i18n/scripts/lib/catalogs.ts");
      const icuSource = vfs.readFile("packages/i18n/scripts/lib/icu.ts");
      expect(catalogsSource).toBeDefined();
      expect(icuSource).toBeDefined();
      writeFileSync(join(libDir, "catalogs.ts"), catalogsSource ?? "");
      writeFileSync(join(libDir, "icu.ts"), icuSource ?? "");

      const emitted = (await import(pathToFileURL(join(libDir, "catalogs.ts")).href)) as {
        packageRoot: () => string;
      };
      expect(emitted.packageRoot()).toBe(join(root, "packages", "i18n"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("ICU export round-trip", () => {
  const ENTRIES = [
    { id: "i18n demo", value: "i18n demo" },
    { id: "Hello, {{name}}!", value: "Hello, {{name}}!" },
    { id: "You have {{count}} new message_one", value: "You have {{count}} new message" },
    { id: "You have {{count}} new message_other", value: "You have {{count}} new messages" },
  ];

  test("maps interpolation and plural suffixes into the ICU subset", () => {
    const messages = exportCatalogEntries(ENTRIES);
    const byId = new Map(messages.map((message) => [message.id, message.icu]));

    expect(byId.get("Hello, {{name}}!")).toBe("Hello, {name}!");
    expect(byId.get("You have {{count}} new message")).toBe(
      "{count, plural, one {You have {count} new message} other {You have {count} new messages}}",
    );
  });

  test("importing the exported ICU restores every catalog entry", () => {
    const messages = exportCatalogEntries(ENTRIES);
    const restored = importCatalogEntries(messages);
    const sort = (entries: readonly { id: string; value: string }[]) =>
      [...entries].sort((first, second) => first.id.localeCompare(second.id));

    expect(sort(restored)).toEqual(sort(ENTRIES));
  });

  test("reports unsupported syntax with the message id", () => {
    expect(() => exportCatalogEntries([{ id: "Nested", value: "See $t(other.message)" }])).toThrow(
      IcuConversionError,
    );
    expect(() => exportCatalogEntries([{ id: "Broken_one", value: "only one form" }])).toThrow(
      IcuConversionError,
    );
  });

  test("extracts placeholder names for validation", () => {
    expect(interpolationNames("Hello, {{name}}! You have {{count}} messages")).toEqual([
      "name",
      "count",
    ]);
  });
});

describe("uniform script contract", () => {
  const CONFIG = { locales: ["en", "fr"], sourceLocale: "en" };
  const SOURCE = {
    "i18n demo": "i18n demo",
    "Hello, {{name}}!": "Hello, {{name}}!",
  };

  function withTempRoot(run: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), "i18next-catalogs-"));
    try {
      writeCatalog(root, "en", SOURCE);
      writeCatalog(root, "fr", SOURCE);
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("pending reports untranslated entries with placeholders and status", () => {
    withTempRoot((root) => {
      const items = collectPending(root, CONFIG, { all: true });
      expect(items).toHaveLength(2);
      const greeting = items.find((item) => item.id === "Hello, {{name}}!");
      expect(greeting?.status).toBe("pending");
      expect(greeting?.placeholders).toEqual(["name"]);
      expect(greeting?.locale).toBe("fr");
    });
  });

  test("apply rejects placeholder mismatches and writes valid translations", () => {
    withTempRoot((root) => {
      const result = applyTranslations(root, CONFIG, [
        { id: "i18n demo", locale: "fr", translation: "démo i18n" },
        { id: "Hello, {{name}}!", locale: "fr", translation: "Bonjour !" },
      ]);

      expect(result.appliedCount).toBe(1);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0]?.id).toBe("Hello, {{name}}!");

      expect(collectPending(root, CONFIG, { locale: "fr" })).toEqual([
        {
          id: "Hello, {{name}}!",
          locale: "fr",
          source: "Hello, {{name}}!",
          context: null,
          comments: [],
          references: [],
          placeholders: ["name"],
          status: "pending",
        },
      ]);
    });
  });

  test("check fails on missing translations unless relaxed", () => {
    withTempRoot((root) => {
      const strict = checkCatalogs(root, CONFIG, { allowMissing: false });
      expect(strict.problems).toHaveLength(2);
      expect(strict.problems.every((problem) => problem.locale === "fr")).toBe(true);

      const relaxed = checkCatalogs(root, CONFIG, { allowMissing: true });
      expect(relaxed.problems).toHaveLength(0);
    });
  });
});
