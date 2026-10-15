import { getI18nSurfaces, type I18nSurface, type ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import { addPackageDependency, type AvailableDependencies } from "../../utils/add-deps";

/**
 * i18next dependency wiring (lane L5c).
 *
 * Natural-language keys with separators disabled live in the shared package;
 * every surface gets `i18next` plus its adapter — `react-i18next` for React
 * surfaces, `i18next-vue` for Nuxt, and the shipped Svelte store / Solid
 * primitive for those frameworks. The `i18next-cli` extractor is a development
 * dependency of `packages/i18n`. Runs only when `config.i18n` is `"i18next"`;
 * the dispatcher lives in `processors/i18n-deps.ts`.
 */

const I18N_PACKAGE_PATH = "packages/i18n/package.json";
const LOCALES_DIR = "packages/i18n/locales";
const SOURCE_CATALOG_PATH = `${LOCALES_DIR}/en/common.json`;
const DEFAULT_LOCALES = ["en", "es", "fr"] as const;

interface SurfaceDeps {
  readonly packagePath: string;
  readonly dependencies: readonly AvailableDependencies[];
}

function surfaceDeps(surface: I18nSurface): SurfaceDeps | null {
  switch (surface) {
    case "next":
    case "tanstack-start":
    case "tanstack-router":
    case "react-router":
      return { packagePath: "apps/web/package.json", dependencies: ["i18next", "react-i18next"] };
    case "nuxt":
      return { packagePath: "apps/web/package.json", dependencies: ["i18next", "i18next-vue"] };
    case "svelte":
    case "solid":
    case "astro":
      return { packagePath: "apps/web/package.json", dependencies: ["i18next"] };
    case "native":
      return {
        packagePath: "apps/native/package.json",
        dependencies: ["i18next", "react-i18next"],
      };
    case "server":
      return { packagePath: "apps/server/package.json", dependencies: ["i18next"] };
    case "electrobun-host":
      return { packagePath: "apps/desktop/package.json", dependencies: ["i18next"] };
    case "opentui-react":
      return { packagePath: "apps/tui/package.json", dependencies: ["i18next", "react-i18next"] };
    case "opentui-core":
    case "opentui-solid":
      return { packagePath: "apps/tui/package.json", dependencies: ["i18next"] };
    case "wxt-react":
      return {
        packagePath: "apps/extension/package.json",
        dependencies: ["i18next", "react-i18next"],
      };
    case "wxt-vue":
      return {
        packagePath: "apps/extension/package.json",
        dependencies: ["i18next", "i18next-vue"],
      };
    case "wxt-vanilla":
    case "wxt-solid":
    case "wxt-svelte":
      return { packagePath: "apps/extension/package.json", dependencies: ["i18next"] };
    case "email":
      // The email surface ships on the `wt/email-support` stack.
      return null;
  }
}

function workspaceVersion(config: ProjectConfig): string {
  return config.packageManager === "npm" ? "*" : "workspace:*";
}

/**
 * Seeds one catalog per configured locale from the English source catalog.
 * Non-source catalogs start as copies of the source text: that is the standard
 * i18next fallback, and `i18n:pending` reports those entries as pending.
 */
function writeCatalogs(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const sourceCatalog = vfs.readFile(SOURCE_CATALOG_PATH);
  if (!sourceCatalog) return;
  const locales = config.i18nOptions?.locales ?? [...DEFAULT_LOCALES];
  for (const locale of locales) {
    vfs.writeFile(`${LOCALES_DIR}/${locale}/common.json`, sourceCatalog);
  }
}

export function getI18nextDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (config.i18n !== "i18next") return;

  addPackageDependency({
    vfs,
    packagePath: I18N_PACKAGE_PATH,
    dependencies: ["i18next"],
    devDependencies: ["i18next-cli"],
    customDevDependencies: { [`@${config.projectName}/config`]: workspaceVersion(config) },
  });

  const wired = new Map<string, Set<AvailableDependencies>>();
  for (const surface of getI18nSurfaces(config)) {
    const deps = surfaceDeps(surface);
    if (!deps || !vfs.exists(deps.packagePath)) continue;
    const dependencies = wired.get(deps.packagePath) ?? new Set<AvailableDependencies>();
    for (const dependency of deps.dependencies) dependencies.add(dependency);
    wired.set(deps.packagePath, dependencies);
  }

  for (const [packagePath, dependencies] of wired) {
    addPackageDependency({
      vfs,
      packagePath,
      dependencies: [...dependencies],
      customDependencies: { [`@${config.projectName}/i18n`]: workspaceVersion(config) },
    });
  }

  writeCatalogs(vfs, config);
}
