import { getI18nSurfaces, type I18nSurface, type ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import { addPackageDependency, type AvailableDependencies } from "../../utils/add-deps";

/**
 * Lingui dependency and surface wiring (lane L5a).
 *
 * `addPackageDependency` owns the versions (seeded in `utils/add-deps.ts`).
 * Two packages are not in the map because Phase 0 did not seed them; they are
 * added with explicit versions and reported as out-of-scope needs:
 * `@lingui/extractor-vue` (Vue extraction) and `@babel/core` (Bun preload).
 *
 * Surface glue is split in two:
 * - `templates/i18n/surface/lingui/**` owns new files (providers, demos).
 * - this processor patches generated configs and anchors the demo into the
 *   existing home screen. Every anchor is single-occurrence; a missing or
 *   duplicated anchor is skipped instead of editing the wrong place.
 */

const REACT_WEB_SURFACES = ["next", "tanstack-start", "tanstack-router", "react-router"] as const;
const VITE_SURFACES = [
  "tanstack-start",
  "tanstack-router",
  "react-router",
  "solid",
  "wxt-vanilla",
  "wxt-react",
  "wxt-solid",
  "wxt-vue",
] as const;
const SOLID_SURFACES = ["solid", "wxt-solid", "opentui-solid"] as const;
const VUE_SURFACES = ["nuxt", "wxt-vue"] as const;
const OPENTUI_SURFACES = ["opentui-core", "opentui-react", "opentui-solid"] as const;
const WXT_SURFACES = ["wxt-vanilla", "wxt-react", "wxt-solid", "wxt-vue"] as const;
const DEFAULT_LOCALES = ["en", "es", "fr"] as const;

interface DependencyPlan {
  dependencies: AvailableDependencies[];
  devDependencies: AvailableDependencies[];
}

const I18N_CORE: AvailableDependencies = "@lingui/core";
const I18N_REACT: AvailableDependencies = "@lingui/react";
const I18N_SOLID: AvailableDependencies = "@lingui/solid";
const I18N_CLI: AvailableDependencies = "@lingui/cli";
const I18N_SWC: AvailableDependencies = "@lingui/swc-plugin";
const I18N_VITE: AvailableDependencies = "@lingui/vite-plugin";
const I18N_MACRO: AvailableDependencies = "@lingui/babel-plugin-lingui-macro";
const I18N_METRO: AvailableDependencies = "@lingui/metro-transformer";

function localesOf(config: ProjectConfig): string[] {
  const configured = config.i18nOptions?.locales;
  return configured && configured.length > 0 ? [...configured] : [...DEFAULT_LOCALES];
}

function hasAny(surfaces: readonly I18nSurface[], list: readonly I18nSurface[]): boolean {
  return list.some((surface) => surfaces.includes(surface));
}

function patch(
  vfs: VirtualFileSystem,
  filePath: string,
  transform: (content: string) => string | undefined,
): void {
  const content = vfs.readFile(filePath);
  if (content === undefined) return;
  const next = transform(content);
  if (next !== undefined && next !== content) vfs.writeFile(filePath, next);
}

function insertAfterOnce(content: string, anchor: string, addition: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index + anchor.length) + addition + content.slice(index + anchor.length);
}

function insertBeforeOnce(content: string, anchor: string, addition: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index) + addition + content.slice(index);
}

function replaceOnce(content: string, anchor: string, replacement: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index) + replacement + content.slice(index + anchor.length);
}

function appendAfterLastImport(content: string, statement: string): string {
  const imports = [...content.matchAll(/^import [^\n]*;$/gm)];
  const last = imports[imports.length - 1];
  if (last && last.index !== undefined) {
    const index = last.index + last[0].length;
    return `${content.slice(0, index)}\n${statement}${content.slice(index)}`;
  }
  const firstLineEnd = content.indexOf("\n");
  if (firstLineEnd === -1) return `${statement}\n${content}`;
  return `${content.slice(0, firstLineEnd + 1)}\n${statement}${content.slice(firstLineEnd + 1)}`;
}

/** Wraps a single JSX element (opening tag matched by `open`) in `<wrapper>`. */
function wrapElement(
  content: string,
  open: RegExp,
  tagName: string,
  wrapper: string,
): string | undefined {
  if (content.includes(`<${wrapper}`)) return undefined;
  const pattern = new RegExp(open.source, open.flags.includes("g") ? open.flags : `${open.flags}g`);
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== 1) return undefined;
  const match = matches[0];
  if (!match || match.index === undefined || match[0].endsWith("/>")) return undefined;
  const openEnd = match.index + match[0].length;
  const close = content.indexOf(`</${tagName}>`, openEnd);
  if (close === -1) return undefined;
  return `${content.slice(0, openEnd)}<${wrapper}>${content.slice(openEnd, close)}</${wrapper}>${content.slice(close)}`;
}

// --- dependencies -----------------------------------------------------------

function addPlan(vfs: VirtualFileSystem, packagePath: string, plan: DependencyPlan): void {
  if (!vfs.exists(packagePath)) return;
  addPackageDependency({
    vfs,
    packagePath,
    dependencies: plan.dependencies,
    devDependencies: plan.devDependencies,
  });
}

function addLinguiDependencies(
  vfs: VirtualFileSystem,
  config: ProjectConfig,
  surfaces: readonly I18nSurface[],
): void {
  const hasReact = hasAny(surfaces, [...REACT_WEB_SURFACES, "wxt-react", "opentui-react"]);
  const hasSolid = hasAny(surfaces, SOLID_SURFACES);
  const hasVue = hasAny(surfaces, VUE_SURFACES);
  const hasVite = hasAny(surfaces, VITE_SURFACES);
  const hasNext = surfaces.includes("next");
  const hasNative = surfaces.includes("native");
  const hasBunHost =
    surfaces.includes("electrobun-host") ||
    hasAny(surfaces, OPENTUI_SURFACES) ||
    (surfaces.includes("server") && config.runtime === "bun");

  const i18nPackage = "packages/i18n/package.json";
  addPlan(vfs, i18nPackage, { dependencies: [I18N_CORE], devDependencies: [I18N_CLI] });
  // Not seeded in dependencyVersionMap (Phase 0 gap); the config imports it.
  addPackageDependency({
    vfs,
    packagePath: i18nPackage,
    customDevDependencies: { "@lingui/format-po": "6.9.1" },
  });

  const workspaceDep = `@${config.projectName}/i18n`;
  const workspaceVersion = config.packageManager === "npm" ? "*" : "workspace:*";
  for (const app of [
    "apps/web",
    "apps/native",
    "apps/server",
    "apps/desktop",
    "apps/extension",
    "apps/tui",
  ]) {
    const packagePath = `${app}/package.json`;
    if (!vfs.exists(packagePath)) continue;
    addPackageDependency({
      vfs,
      packagePath,
      customDependencies: { [workspaceDep]: workspaceVersion },
    });
  }

  if (hasVue) {
    // Not seeded in dependencyVersionMap (Phase 0 gap); version follows @lingui/cli.
    addPackageDependency({
      vfs,
      packagePath: i18nPackage,
      customDevDependencies: { "@lingui/extractor-vue": "6.9.1" },
    });
  }
  if (hasBunHost) {
    // Peer of @lingui/babel-plugin-lingui-macro, used by bun-preload.ts.
    addPackageDependency({
      vfs,
      packagePath: i18nPackage,
      customDevDependencies: { "@babel/core": "^7.29.0" },
    });
    addPlan(vfs, i18nPackage, {
      dependencies: [],
      devDependencies: [I18N_MACRO],
    });
  }

  if (vfs.exists("apps/web/package.json")) {
    addPlan(vfs, "apps/web/package.json", {
      dependencies: [I18N_CORE, ...(hasSolid ? [I18N_SOLID] : hasReact ? [I18N_REACT] : [])],
      devDependencies: [
        ...(hasNext ? [I18N_SWC] : []),
        ...(hasVite && !hasNext ? [I18N_VITE] : []),
        ...(hasSolid ? [I18N_MACRO] : []),
      ],
    });
  }

  if (vfs.exists("apps/native/package.json") && hasNative) {
    addPlan(vfs, "apps/native/package.json", {
      dependencies: [I18N_CORE, I18N_REACT],
      devDependencies: [I18N_MACRO, I18N_METRO],
    });
  }

  if (vfs.exists("apps/server/package.json")) {
    addPlan(vfs, "apps/server/package.json", {
      dependencies: [I18N_CORE],
      devDependencies: [],
    });
  }

  if (vfs.exists("apps/desktop/package.json")) {
    addPlan(vfs, "apps/desktop/package.json", {
      dependencies: [I18N_CORE],
      devDependencies: [],
    });
  }

  if (vfs.exists("apps/extension/package.json") && hasAny(surfaces, WXT_SURFACES)) {
    addPlan(vfs, "apps/extension/package.json", {
      dependencies: [I18N_CORE],
      devDependencies: hasVite ? [I18N_VITE] : [],
    });
  }

  if (vfs.exists("apps/tui/package.json") && hasAny(surfaces, OPENTUI_SURFACES)) {
    addPlan(vfs, "apps/tui/package.json", {
      dependencies: [I18N_CORE],
      devDependencies: [I18N_MACRO],
    });
  }
}

// --- catalogs ---------------------------------------------------------------

function placeholderCompiledCatalog(): string {
  return [
    "/* eslint-disable */",
    'import type { Messages } from "@lingui/core";',
    "",
    'export const messages = JSON.parse("{}") as unknown as Messages;',
    "",
  ].join("\n");
}

function catalogHeader(locale: string): string {
  return [
    'msgid ""',
    'msgstr ""',
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=utf-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    '"X-Generator: @lingui/cli\\n"',
    `"Language: ${locale}\\n"`,
    "",
  ].join("\n");
}

/**
 * Ships a header-only PO and an empty compiled catalog per locale. Extract
 * fills the PO; compile replaces the compiled placeholder. Existing catalogs
 * are never overwritten (Add Path re-runs).
 */
function writeLinguiCatalogs(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (!vfs.exists("packages/i18n/package.json")) return;
  for (const locale of localesOf(config)) {
    const poPath = `packages/i18n/locales/${locale}/messages.po`;
    const compiledPath = `packages/i18n/locales/${locale}/messages.ts`;
    if (!vfs.exists(poPath)) vfs.writeFile(poPath, catalogHeader(locale));
    if (!vfs.exists(compiledPath)) vfs.writeFile(compiledPath, placeholderCompiledCatalog());
  }
}

// --- config patches ---------------------------------------------------------

const LINGUI_CONFIG_FROM_WEB = "../../packages/i18n/lingui.config.ts";
const VITE_MACRO_TRANSFORM = `{ macroTransform: true, configPath: "${LINGUI_CONFIG_FROM_WEB}" }`;
const VITE_BABEL_TRANSFORM = `{ configPath: "${LINGUI_CONFIG_FROM_WEB}" }`;

function patchNextConfig(vfs: VirtualFileSystem): void {
  patch(vfs, "apps/web/next.config.ts", (content) => {
    const withImport = insertAfterOnce(
      content,
      'import type { NextConfig } from "next";',
      `\nimport { linguiMacroSwcPlugin } from "@lingui/swc-plugin/options";\n\nconst LINGUI_CONFIG_PATH = "${LINGUI_CONFIG_FROM_WEB}";`,
    );
    if (!withImport) return undefined;
    return insertAfterOnce(
      withImport,
      "const nextConfig: NextConfig = {",
      `\n\texperimental: {\n\t\tswcPlugins: [linguiMacroSwcPlugin({}, { configPath: LINGUI_CONFIG_PATH })],\n\t},`,
    );
  });
}

function patchViteConfig(
  vfs: VirtualFileSystem,
  filePath: string,
  importAnchor: string,
  solid: boolean,
): void {
  patch(vfs, filePath, (content) => {
    let next = insertAfterOnce(
      content,
      importAnchor,
      '\nimport { lingui } from "@lingui/vite-plugin";',
    );
    if (!next) return undefined;
    if (solid) {
      const withPlugin = insertAfterOnce(
        next,
        "plugins: [",
        `\n    lingui(${VITE_BABEL_TRANSFORM}),`,
      );
      if (!withPlugin) return undefined;
      return insertAfterOnce(
        withPlugin,
        "solid({",
        '\n      babel: {\n        plugins: ["@lingui/babel-plugin-lingui-macro"],\n      },',
      );
    }
    return insertAfterOnce(next, "plugins: [", `\n    lingui(${VITE_MACRO_TRANSFORM}),`);
  });
}

function patchViteSurfaces(vfs: VirtualFileSystem): void {
  const viteConfig = "apps/web/vite.config.ts";
  // Each call no-ops unless its import anchor is present, so one project
  // applies exactly one of them.
  patchViteConfig(vfs, viteConfig, 'import viteReact from "@vitejs/plugin-react";', false);
  patchViteConfig(vfs, viteConfig, 'import react from "@vitejs/plugin-react";', false);
  patchViteConfig(vfs, viteConfig, 'import { reactRouter } from "@react-router/dev/vite";', false);
  patchViteConfig(vfs, viteConfig, 'import solid from "@solidjs/vite-plugin";', true);
}

function patchNuxtConfig(vfs: VirtualFileSystem): void {
  patch(vfs, "apps/web/nuxt.config.ts", (content) => {
    const withImport = insertBeforeOnce(
      content,
      "// https://nuxt.com/docs/api/configuration/nuxt-config",
      'import { lingui } from "@lingui/vite-plugin";\n\n',
    );
    if (!withImport) return undefined;
    if (withImport.includes("  vite: {")) {
      return insertAfterOnce(
        withImport,
        "  vite: {",
        `\n    plugins: [lingui(${VITE_MACRO_TRANSFORM})],`,
      );
    }
    return insertAfterOnce(
      withImport,
      "export default defineNuxtConfig({",
      `\n  vite: {\n    plugins: [lingui(${VITE_MACRO_TRANSFORM})],\n  },`,
    );
  });
}

function patchAstroConfig(vfs: VirtualFileSystem): void {
  patch(vfs, "apps/web/astro.config.mjs", (content) => {
    const withImport = insertAfterOnce(
      content,
      'import tailwindcss from "@tailwindcss/vite";',
      '\nimport { lingui } from "@lingui/vite-plugin";',
    );
    if (!withImport) return undefined;
    return replaceOnce(
      withImport,
      "plugins: [tailwindcss()],",
      `plugins: [lingui(${VITE_MACRO_TRANSFORM}), tailwindcss()],`,
    );
  });
}

function patchNativeConfig(vfs: VirtualFileSystem): void {
  patch(vfs, "apps/native/metro.config.js", (content) => {
    const addition = [
      "// @lingui/metro-transformer compiles `messages.po` imports on the fly.",
      'config.transformer = { ...config.transformer, babelTransformerPath: require.resolve("@lingui/metro-transformer/expo") };',
      'config.resolver = { ...config.resolver, sourceExts: [...config.resolver.sourceExts, "po", "pot"] };',
      "",
      "",
    ].join("\n");
    return insertBeforeOnce(content, "module.exports = withVarlockMetroConfig", addition);
  });

  patch(vfs, "apps/native/babel.config.js", (content) => {
    if (content.includes("@lingui/babel-plugin-lingui-macro")) return undefined;
    return insertAfterOnce(content, "plugins: [", '\n    "@lingui/babel-plugin-lingui-macro",');
  });
}

function wrapReactRoots(vfs: VirtualFileSystem): void {
  const themeProviderRoots = [
    "apps/web/src/components/providers.tsx",
    "apps/web/src/routes/__root.tsx",
    "apps/web/src/root.tsx",
  ];

  for (const file of themeProviderRoots) {
    patch(vfs, file, (content) => {
      const wrapped = wrapElement(
        content,
        /<ThemeProvider\b[^>]*>/s,
        "ThemeProvider",
        "I18nProvider",
      );
      if (!wrapped) return undefined;
      return appendAfterLastImport(
        wrapped,
        'import { I18nProvider } from "@/components/i18n-provider";',
      );
    });
  }

  patch(vfs, "apps/web/src/routes/__root.tsx", (content) => {
    if (content.includes("@/components/i18n-provider")) return undefined;
    const anchor = '<div className="grid h-svh grid-rows-[auto_1fr]">';
    const wrapped = wrapElement(
      content,
      new RegExp(anchor.replace(/[[\]]/g, "\\$&")),
      "div",
      "I18nProvider",
    );
    if (!wrapped) return undefined;
    return appendAfterLastImport(
      wrapped,
      'import { I18nProvider } from "@/components/i18n-provider";',
    );
  });

  patch(vfs, "apps/web/src/App.tsx", (content) => {
    const wrapped = wrapElement(content, /<Router>/, "Router", "I18nProvider");
    if (!wrapped) return undefined;
    return appendAfterLastImport(
      wrapped,
      'import { I18nProvider } from "~/components/i18n-provider";',
    );
  });
}

// --- demos ------------------------------------------------------------------

const REACT_HOME_PRE = '<pre className="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>';
const SOLID_HOME_PRE = '<pre class="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>';

function insertIntoHome(
  vfs: VirtualFileSystem,
  file: string,
  anchor: string,
  after: string,
  importStatement?: string,
): void {
  patch(vfs, file, (content) => {
    const withDemo = insertAfterOnce(content, anchor, after);
    if (!withDemo) return undefined;
    return importStatement ? appendAfterLastImport(withDemo, importStatement) : withDemo;
  });
}

/** The native tab screens indent `</Container>` with spaces or tabs. */
function insertNativeDemo(vfs: VirtualFileSystem): void {
  patch(vfs, "apps/native/app/(drawer)/(tabs)/index.tsx", (content) => {
    const close = content.indexOf("</Container>");
    if (close === -1) return undefined;
    if (content.indexOf("</Container>", close + 1) !== -1) return undefined;
    const lineStart = content.lastIndexOf("\n", close) + 1;
    const indent = content.slice(lineStart, close);
    const withoutDemo = content.slice(0, lineStart);
    return appendAfterLastImport(
      `${withoutDemo}${indent}<I18nDemo />\n${content.slice(lineStart)}`,
      'import { I18nDemo } from "@/components/i18n-demo";',
    );
  });
}

function insertDemos(vfs: VirtualFileSystem): void {
  const reactPages = [
    "apps/web/src/app/page.tsx",
    "apps/web/src/routes/index.tsx",
    "apps/web/src/routes/_index.tsx",
  ];
  for (const page of reactPages) {
    insertIntoHome(
      vfs,
      page,
      REACT_HOME_PRE,
      "\n      <I18nDemo />",
      'import { I18nDemo } from "@/components/i18n-demo";',
    );
  }

  insertIntoHome(
    vfs,
    "apps/web/src/routes/index.tsx",
    SOLID_HOME_PRE,
    "\n      <I18nDemo />",
    'import { I18nDemo } from "~/components/i18n-demo";',
  );

  patch(vfs, "apps/web/app/pages/index.vue", (content) =>
    insertBeforeOnce(content, '<div class="grid gap-6 mt-6">', '<I18nDemo class="mt-6" />\n\n    '),
  );

  insertIntoHome(
    vfs,
    "apps/web/src/pages/index.astro",
    '<pre class="overflow-x-auto font-mono text-sm text-white">{TITLE_TEXT}</pre>',
    "\n    <I18nDemo />",
    'import I18nDemo from "../components/I18nDemo.astro";',
  );

  insertNativeDemo(vfs);
}

// --- server and Bun hosts ---------------------------------------------------

function addServerDemoRoute(vfs: VirtualFileSystem, anchor: string, snippet: string): void {
  patch(vfs, "apps/server/src/index.ts", (content) => {
    const withRoute = insertBeforeOnce(content, anchor, snippet);
    if (!withRoute) return undefined;
    return appendAfterLastImport(withRoute, 'import { renderI18nDemo } from "./i18n-demo";');
  });
}

function writeNitroDemoRoute(vfs: VirtualFileSystem): void {
  vfs.writeFile(
    "apps/server/server/routes/i18n-demo.get.ts",
    [
      'import { renderI18nDemo } from "../../src/i18n-demo";',
      "",
      "export default defineEventHandler(async (event) => {",
      '  const locale = getHeader(event, "x-app-locale") ?? getCookie(event, "locale");',
      "  return renderI18nDemo(locale);",
      "});",
      "",
    ].join("\n"),
  );
}

function patchHonoServer(vfs: VirtualFileSystem): void {
  patch(vfs, "apps/server/src/index.ts", (content) => {
    const withCookieImport = insertAfterOnce(
      content,
      'import { cors } from "hono/cors";',
      '\nimport { getCookie } from "hono/cookie";',
    );
    if (!withCookieImport) return undefined;
    const withRoute = insertBeforeOnce(
      withCookieImport,
      'app.get("/", (c) => {',
      [
        'app.get("/i18n-demo", async (c) => {',
        '\tconst locale = c.req.header("x-app-locale") ?? getCookie(c, "locale");',
        "\treturn c.json(await renderI18nDemo(locale));",
        "});",
        "",
        "",
      ].join("\n"),
    );
    if (!withRoute) return undefined;
    return appendAfterLastImport(withRoute, 'import { renderI18nDemo } from "./i18n-demo";');
  });
}

function patchServerSurfaces(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (!vfs.exists("apps/server/package.json")) return;

  switch (config.backend) {
    case "hono":
      patchHonoServer(vfs);
      break;
    case "express":
      addServerDemoRoute(
        vfs,
        'app.get("/", (_req, res) => {',
        [
          'app.get("/i18n-demo", async (req, res) => {',
          '\tconst locale = req.header("x-app-locale");',
          "\tres.json(await renderI18nDemo(locale ?? undefined));",
          "});",
          "",
        ].join("\n"),
      );
      break;
    case "fastify":
      addServerDemoRoute(
        vfs,
        "fastify.get('/', async () => {",
        [
          "fastify.get('/i18n-demo', async (request) => {",
          '\tconst locale = request.headers["x-app-locale"];',
          '\treturn renderI18nDemo(typeof locale === "string" ? locale : undefined);',
          "});",
          "",
        ].join("\n"),
      );
      break;
    case "elysia":
      addServerDemoRoute(
        vfs,
        '\t.get("/", () => "OK")',
        [
          '\t.get("/i18n-demo", async ({ request }) => {',
          '\t\tconst locale = request.headers.get("x-app-locale");',
          "\t\treturn renderI18nDemo(locale ?? undefined);",
          "\t})",
        ].join("\n"),
      );
      break;
    case "nitro":
      writeNitroDemoRoute(vfs);
      break;
    default:
      break;
  }

  if (config.runtime === "bun") ensureBunPreload(vfs, "apps/server");
}

function ensureBunPreload(vfs: VirtualFileSystem, appDir: string): void {
  const file = `${appDir}/bunfig.toml`;
  const existing = vfs.readFile(file) ?? "";
  if (existing.includes("bun-preload.ts") || /^preload\s*=/m.test(existing)) return;
  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  vfs.writeFile(file, `${existing}${separator}preload = ["../../packages/i18n/bun-preload.ts"]\n`);
}

function patchElectrobunHost(vfs: VirtualFileSystem): void {
  patch(vfs, "apps/desktop/src/bun/index.ts", (content) => {
    const withCall = insertBeforeOnce(
      content,
      'console.log("Electrobun desktop shell started.");',
      "await printI18nDemo();\n\n",
    );
    if (!withCall) return undefined;
    return appendAfterLastImport(withCall, 'import { printI18nDemo } from "./i18n-demo";');
  });
  ensureBunPreload(vfs, "apps/desktop");
}

// --- externally scaffolded surfaces ----------------------------------------

/**
 * WXT and OpenTUI apps are created after generation by `wxt init` /
 * `create-tui`, which refuse a non-empty (or existing) target directory. The
 * surface templates stay in the tree for the Add Path and for a future
 * post-scaffold step; on the Create Path they must not reach the output, so
 * they are dropped while the app does not exist yet.
 */
function guardExternalScaffoldSurfaces(
  vfs: VirtualFileSystem,
  surfaces: readonly I18nSurface[],
): void {
  if (hasAny(surfaces, WXT_SURFACES) && !vfs.exists("apps/extension/package.json")) {
    dropFilesFor(vfs, "apps/extension");
  }
  if (hasAny(surfaces, OPENTUI_SURFACES) && !vfs.exists("apps/tui/package.json")) {
    dropFilesFor(vfs, "apps/tui");
  }
  if (hasAny(surfaces, OPENTUI_SURFACES) && vfs.exists("apps/tui/package.json")) {
    ensureBunPreload(vfs, "apps/tui");
  }
}

function dropFilesFor(vfs: VirtualFileSystem, appDir: string): void {
  for (const file of vfs.getAllFiles()) {
    if (file.startsWith(`${appDir}/`)) vfs.deleteFile(file);
  }
}

// --- entry point ------------------------------------------------------------

export function getLinguiDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const surfaces = getI18nSurfaces(config);

  addLinguiDependencies(vfs, config, surfaces);
  writeLinguiCatalogs(vfs, config);

  if (surfaces.includes("next")) patchNextConfig(vfs);
  patchViteSurfaces(vfs);
  if (surfaces.includes("nuxt")) patchNuxtConfig(vfs);
  if (surfaces.includes("astro")) patchAstroConfig(vfs);
  if (surfaces.includes("native")) patchNativeConfig(vfs);

  wrapReactRoots(vfs);
  insertDemos(vfs);

  patchServerSurfaces(vfs, config);
  if (surfaces.includes("electrobun-host")) patchElectrobunHost(vfs);

  guardExternalScaffoldSurfaces(vfs, surfaces);
}
