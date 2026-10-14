import {
  getI18nSurfaces,
  I18N_SUPPORT,
  type I18nSurface,
  type ProjectConfig,
} from "@better-t-stack/types";
import {
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import { addPackageDependency } from "../../utils/add-deps";

/**
 * wuchale dependency wiring (lane L5d; experimental).
 *
 * Adds `wuchale` and the adapter packages the generated project actually uses,
 * gives every surface app the `@<project>/i18n` workspace dependency, and wires
 * the bundler plugins that support implicit extraction (`wuchale/vite` and the
 * Astro integration). `wuchale.config.mjs` lives in `packages/i18n`; every
 * adapter there scopes its `files` globs to a single surface and stores its
 * catalogs in a per-adapter `.po` file.
 *
 * AI translation stays disabled: the generated config never emits an `ai`
 * entry. Runs only when `config.i18n` is `"wuchale"`; the dispatcher lives in
 * `processors/i18n-deps.ts`.
 */

export type WuchaleAdapterPackage =
  | "wuchale"
  | "@wuchale/jsx"
  | "@wuchale/svelte"
  | "@wuchale/astro";

export interface WuchaleAdapterPlan {
  /** Adapter key inside `wuchale.config.mjs` and in the `.po` file names. */
  readonly key: string;
  /** Adapter package (`wuchale` for the built-in vanilla adapter). */
  readonly adapterPackage: WuchaleAdapterPackage;
  /** `package.json` of the app whose sources this adapter extracts from. */
  readonly appPackagePath: string;
  readonly surfaces: readonly I18nSurface[];
}

const WEB_SURFACES = [
  "next",
  "tanstack-start",
  "tanstack-router",
  "react-router",
  "svelte",
  "solid",
  "astro",
] as const satisfies readonly I18nSurface[];

const SURFACE_APP_PACKAGES = new Map<I18nSurface, string>([
  ["next", "apps/web/package.json"],
  ["tanstack-start", "apps/web/package.json"],
  ["tanstack-router", "apps/web/package.json"],
  ["react-router", "apps/web/package.json"],
  ["svelte", "apps/web/package.json"],
  ["solid", "apps/web/package.json"],
  ["astro", "apps/web/package.json"],
  ["server", "apps/server/package.json"],
  ["email", "packages/email/package.json"],
  ["electrobun-host", "apps/desktop/package.json"],
  ["opentui-core", "apps/tui/package.json"],
  ["opentui-react", "apps/tui/package.json"],
  ["opentui-solid", "apps/tui/package.json"],
  ["wxt-vanilla", "apps/extension/package.json"],
  ["wxt-react", "apps/extension/package.json"],
  ["wxt-solid", "apps/extension/package.json"],
  ["wxt-svelte", "apps/extension/package.json"],
]);

const SURFACE_ADAPTER_PACKAGES = new Map<I18nSurface, WuchaleAdapterPackage>([
  ["next", "@wuchale/jsx"],
  ["tanstack-start", "@wuchale/jsx"],
  ["tanstack-router", "@wuchale/jsx"],
  ["react-router", "@wuchale/jsx"],
  ["solid", "@wuchale/jsx"],
  ["svelte", "@wuchale/svelte"],
  ["astro", "@wuchale/astro"],
  ["email", "@wuchale/jsx"],
  ["opentui-react", "@wuchale/jsx"],
  ["opentui-solid", "@wuchale/jsx"],
  ["wxt-react", "@wuchale/jsx"],
  ["wxt-solid", "@wuchale/jsx"],
  ["wxt-svelte", "@wuchale/svelte"],
]);

const WUCHALE_CONFIG_PATH = "../../packages/i18n/wuchale.config.mjs";

/**
 * Only surfaces whose support cell is not `unsupported` get adapters, deps or
 * glue. `nuxt`, `native`, `tauri-host` and `wxt-vue` have no wuchale adapter.
 */
export function getWuchaleSurfaces(config: ProjectConfig): I18nSurface[] {
  return getI18nSurfaces(config).filter(
    (surface) => I18N_SUPPORT.wuchale[surface].level !== "unsupported",
  );
}

/** Groups the present surfaces by adapter so deps, config and glue agree. */
export function getWuchaleAdapterPlans(config: ProjectConfig): WuchaleAdapterPlan[] {
  const plans = new Map<
    string,
    { adapterPackage: WuchaleAdapterPackage; appPackagePath: string; surfaces: I18nSurface[] }
  >();

  for (const surface of getWuchaleSurfaces(config)) {
    const adapterPackage = SURFACE_ADAPTER_PACKAGES.get(surface) ?? "wuchale";
    const appPackagePath = SURFACE_APP_PACKAGES.get(surface);
    if (!appPackagePath) continue;

    const key = wuchaleAdapterKey(surface);
    const existing = plans.get(key);
    if (existing) {
      existing.surfaces.push(surface);
      continue;
    }
    plans.set(key, { adapterPackage, appPackagePath, surfaces: [surface] });
  }

  return [...plans].map(([key, plan]) => ({ key, ...plan }));
}

/** One key per app, so two surfaces in the same app share a single adapter. */
export function wuchaleAdapterKey(surface: I18nSurface): string {
  if (WEB_SURFACES.some((value) => value === surface)) return "web";
  if (surface.startsWith("wxt-")) return "extension";
  if (surface.startsWith("opentui-")) return "tui";
  if (surface === "electrobun-host") return "desktop";
  return surface;
}

export function getWuchaleDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (config.i18n !== "wuchale") return;

  const i18nPackagePath = "packages/i18n/package.json";
  if (!vfs.exists(i18nPackagePath)) return;

  const plans = getWuchaleAdapterPlans(config);
  const adapterPackages = new Set<WuchaleAdapterPackage>(plans.map((plan) => plan.adapterPackage));

  addPackageDependency({
    vfs,
    packagePath: i18nPackagePath,
    dependencies: ["wuchale", ...adapterPackages],
  });

  const workspaceVersion = config.packageManager === "npm" ? "*" : "workspace:*";
  const i18nPackageName = `@${config.projectName}/i18n`;
  for (const plan of plans) {
    if (!vfs.exists(plan.appPackagePath)) continue;
    addPackageDependency({
      vfs,
      packagePath: plan.appPackagePath,
      dependencies: [
        "wuchale",
        ...(plan.adapterPackage === "wuchale" ? [] : [plan.adapterPackage]),
      ],
      customDependencies: { [i18nPackageName]: workspaceVersion },
    });
  }

  wireVitePlugin(vfs, config);
  wireAstroIntegration(vfs, config);
}

/**
 * Vite-based frontends get the `wuchale/vite` plugin; the plugin extracts and
 * transforms in dev and build. Next.js, server and the externally scaffolded
 * hosts have no bundler integration — `WUCHALE.md` documents the
 * `wuchale --modify <adapter>` fallback for them.
 */
function wireVitePlugin(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const viteConfigPath = "apps/web/vite.config.ts";
  if (!vfs.exists(viteConfigPath)) return;
  if (!isViteWebFrontend(config)) return;

  const content = vfs.readFile(viteConfigPath);
  if (!content) return;

  const sourceFile = createSourceFile("vite.config.ts", content);
  if (hasImport(sourceFile, "wuchale/vite")) return;

  const plugins = findArrayProperty(sourceFile, "plugins");
  if (!plugins) return;

  sourceFile.addImportDeclaration({ namedImports: ["wuchale"], moduleSpecifier: "wuchale/vite" });
  plugins.addElement(`wuchale({ configPath: "${WUCHALE_CONFIG_PATH}" })`);

  vfs.writeFile(viteConfigPath, sourceFile.getFullText());
}

function isViteWebFrontend(config: ProjectConfig): boolean {
  const viteFrontends = ["tanstack-start", "tanstack-router", "react-router", "solid", "svelte"];
  return config.frontend.some((frontend) => viteFrontends.includes(frontend));
}

function wireAstroIntegration(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const astroConfigPath = "apps/web/astro.config.mjs";
  if (!vfs.exists(astroConfigPath)) return;
  if (!config.frontend.includes("astro")) return;

  const content = vfs.readFile(astroConfigPath);
  if (!content) return;

  const sourceFile = createSourceFile("astro.config.mjs", content);
  if (hasImport(sourceFile, "@wuchale/astro/integration")) return;

  const configObject = findDefineConfigObject(sourceFile);
  if (!configObject) return;

  const integrations = configObject.getProperty("integrations");
  if (integrations && !integrations.isKind(SyntaxKind.PropertyAssignment)) return;

  sourceFile.addImportDeclaration({
    namedImports: ["wuchale"],
    moduleSpecifier: "@wuchale/astro/integration",
  });

  const assignment = integrations?.asKind(SyntaxKind.PropertyAssignment);
  if (assignment) {
    assignment
      .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression)
      .addElement(`wuchale({ configPath: "${WUCHALE_CONFIG_PATH}" })`);
  } else {
    configObject
      .addPropertyAssignment({ name: "integrations", initializer: "[]" })
      .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression)
      .addElement(`wuchale({ configPath: "${WUCHALE_CONFIG_PATH}" })`);
  }

  vfs.writeFile(astroConfigPath, sourceFile.getFullText());
}

function createSourceFile(fileName: string, content: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: fileName.endsWith(".mjs") },
    manipulationSettings: { quoteKind: QuoteKind.Double },
  });
  return project.createSourceFile(fileName, content);
}

function hasImport(sourceFile: SourceFile, moduleSpecifier: string): boolean {
  return sourceFile
    .getImportDeclarations()
    .some((imp) => imp.getModuleSpecifierValue() === moduleSpecifier);
}

function findArrayProperty(
  sourceFile: SourceFile,
  name: string,
): ArrayLiteralExpression | undefined {
  const assignments = sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((property) => property.getName() === name);
  for (const property of assignments) {
    const array = property.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (array) return array;
  }
  return undefined;
}

function findDefineConfigObject(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  const exportAssignment = sourceFile.getExportAssignment(
    (assignment) => !assignment.isExportEquals(),
  );
  const expression = exportAssignment?.getExpression();
  if (!expression || !Node.isCallExpression(expression)) return undefined;
  const [firstArgument] = expression.getArguments();
  return firstArgument?.asKind(SyntaxKind.ObjectLiteralExpression) ?? undefined;
}
