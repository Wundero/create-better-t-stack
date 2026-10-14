import type { Frontend, ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../../core/virtual-fs";
import {
  wireAstroConfig,
  wireNextConfig,
  wireNuxtConfig,
  wireViteConfig,
  writeIgnorePatterns,
} from "./configs";
import { addParaglideDependencies, upgradeCheckTypes, type ParaglideWebApp } from "./deps";
import {
  insertAstroDemo,
  insertNextDemo,
  insertNuxtDemo,
  insertReactNativeDemo,
  insertSolidDemo,
  insertSvelteDemo,
  insertViteReactDemo,
  wireElectrobunHost,
  wireServerRoutes,
} from "./surfaces";

/**
 * Paraglide dependency wiring (lane L5b).
 *
 * Runs only when `config.i18n` is `"paraglide"`; the dispatcher lives in
 * `processors/i18n-deps.ts`.
 *
 * Layout (design D4 + the template-handler contract):
 * - `templates/i18n/lib/paraglide/**` → `packages/i18n` (catalogs, runtime,
 *   scripts, `project.inlang`), emitted by `template-handlers/i18n.ts`;
 * - `templates/i18n/surface/paraglide/<surface>/**` → the surface app.
 *
 * This processor adds the dependencies and wires the compiler into each app:
 * a per-app `paraglideVitePlugin` (or the Next webpack plugin) for Vite/Next
 * surfaces, CLI compilation through `i18n:compile` for the hosts without a
 * Vite pipeline (server, native, electrobun), plus the per-surface demo.
 */
export function getParaglideDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (config.i18n !== "paraglide") return;
  if (!vfs.exists("packages/i18n/package.json")) return;

  ensureConfiguredCatalogs(vfs, config);

  const wiring = resolveWiring(config);
  addParaglideDependencies(vfs, config, wiring.webApp);
  upgradeCheckTypes(vfs, wiring.webApp);
  writeIgnorePatterns(vfs, wiring.webApp?.ignorePath);

  if (wiring.webApp) {
    wireWebConfig(vfs, wiring.webApp);
  }

  wireSurfaces(vfs, config, wiring);
}

interface Wiring {
  readonly webApp?: ParaglideWebApp;
  readonly hasNative: boolean;
  readonly hasServer: boolean;
  readonly hasElectrobun: boolean;
}

const DEFAULT_LOCALES = ["en", "es", "fr"];
const EMPTY_CATALOG = `${JSON.stringify(
  { $schema: "https://inlang.com/schema/inlang-message-format" },
  null,
  2,
)}\n`;

/**
 * The shipped catalog templates cover `en`, `es` and `fr`. Every other
 * configured locale gets an empty catalog that `i18n:extract` and the
 * translate skills fill. A source locale without a shipped template is seeded
 * with the English demo catalog so the demo keeps compiling until it is
 * translated.
 */
function ensureConfiguredCatalogs(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const locales = config.i18nOptions?.locales ?? DEFAULT_LOCALES;
  const sourceLocale = config.i18nOptions?.sourceLocale ?? "en";
  const englishCatalog = vfs.readFile("packages/i18n/messages/en.json");
  const configured = new Set(locales);
  const messagesPrefix = "packages/i18n/messages/";

  for (const file of vfs.getAllFiles()) {
    if (!file.startsWith(messagesPrefix)) continue;
    const locale = file.slice(messagesPrefix.length).replace(/\.json$/, "");
    if (!configured.has(locale)) vfs.deleteFile(file);
  }

  for (const locale of locales) {
    const path = `${messagesPrefix}${locale}.json`;
    if (vfs.exists(path)) continue;
    vfs.writeFile(
      path,
      locale === sourceLocale && englishCatalog !== undefined ? englishCatalog : EMPTY_CATALOG,
    );
  }
}

const REACT_FRAMEWORKS = ["tanstack-router", "react-router", "tanstack-start", "next"] as const;
const REACT_FRONTEND_SET: ReadonlySet<string> = new Set(REACT_FRAMEWORKS);
const OTHER_WEB_SURFACES = ["nuxt", "svelte", "solid", "astro"] as const;

type WebSurface = ParaglideWebApp["surface"];

function webSurfaceOf(frontend: Frontend): WebSurface | undefined {
  switch (frontend) {
    case "next":
    case "tanstack-start":
    case "tanstack-router":
    case "react-router":
    case "nuxt":
    case "svelte":
    case "solid":
    case "astro":
      return frontend;
    default:
      return undefined;
  }
}

/**
 * Mirrors `processFrontendTemplates`: the CLI normalizes the configuration to
 * at most one web frontend, the first selected React framework wins, and the
 * remaining frameworks keep the handler's fixed order (nuxt → svelte → solid →
 * astro).
 */
function resolveWebSurface(frontends: readonly Frontend[]): WebSurface | undefined {
  for (const frontend of frontends) {
    const surface = webSurfaceOf(frontend);
    if (surface && REACT_FRONTEND_SET.has(surface)) return surface;
  }

  for (const candidate of OTHER_WEB_SURFACES) {
    if (frontends.some((frontend) => frontend === candidate)) return candidate;
  }

  return undefined;
}

function resolveWiring(config: ProjectConfig): Wiring {
  const frontends = config.frontend;
  const webSurface = resolveWebSurface(frontends);

  const webApp: ParaglideWebApp | undefined = webSurface
    ? {
        surface: webSurface,
        outdir: webSurface === "nuxt" ? "./app/paraglide" : "./src/paraglide",
        ignorePath: webSurface === "nuxt" ? "apps/web/app/paraglide" : "apps/web/src/paraglide",
      }
    : undefined;

  return {
    webApp,
    hasNative: frontends.some((frontend) => frontend.startsWith("native-")),
    hasServer: ["hono", "express", "fastify", "elysia", "nitro"].some(
      (backend) => backend === config.backend,
    ),
    hasElectrobun: config.addons.includes("electrobun"),
  };
}

function wireWebConfig(vfs: VirtualFileSystem, webApp: ParaglideWebApp): void {
  const project = "../../packages/i18n/project.inlang";

  switch (webApp.surface) {
    case "next":
      wireNextConfig(vfs, { path: "apps/web/next.config.ts", project });
      return;
    case "nuxt":
      wireNuxtConfig(vfs, {
        path: "apps/web/nuxt.config.ts",
        project,
        outdir: webApp.outdir,
      });
      return;
    case "astro":
      wireAstroConfig(vfs, {
        path: "apps/web/astro.config.mjs",
        project,
        outdir: webApp.outdir,
      });
      return;
    default:
      wireViteConfig(vfs, { path: "apps/web/vite.config.ts", project, outdir: webApp.outdir });
  }
}

function wireSurfaces(vfs: VirtualFileSystem, config: ProjectConfig, wiring: Wiring): void {
  switch (wiring.webApp?.surface) {
    case "next":
      insertNextDemo(vfs);
      break;
    case "nuxt":
      insertNuxtDemo(vfs);
      break;
    case "svelte":
      insertSvelteDemo(vfs);
      break;
    case "astro":
      insertAstroDemo(vfs);
      break;
    case "solid":
      insertSolidDemo(vfs);
      break;
    case "tanstack-start":
    case "tanstack-router":
      insertViteReactDemo(vfs, "apps/web/src/routes/index.tsx");
      break;
    case "react-router":
      insertViteReactDemo(vfs, "apps/web/src/routes/_index.tsx");
      break;
    default:
      break;
  }

  if (wiring.hasNative) insertReactNativeDemo(vfs);
  if (wiring.hasServer) wireServerRoutes(vfs, config.backend);
  if (wiring.hasElectrobun) wireElectrobunHost(vfs);
}
