import type { ProjectConfig } from "@better-t-stack/types";

import type { JsonValue } from "../../../core/json-types";
import type { VirtualFileSystem } from "../../../core/virtual-fs";
import { addPackageDependency } from "../../../utils/add-deps";

/** The app that also runs a Vite/Next build, resolved by `getParaglideDeps`. */
export interface ParaglideWebApp {
  readonly surface:
    | "next"
    | "tanstack-start"
    | "tanstack-router"
    | "react-router"
    | "nuxt"
    | "svelte"
    | "solid"
    | "astro";
  /** App-local Paraglide output, relative to the app root. */
  readonly outdir: string;
  /** Root `.gitignore` entry for the app-local output. */
  readonly ignorePath: string;
}

interface PackageJson {
  scripts?: Record<string, string>;
  [key: string]: JsonValue | undefined;
}

const PARAGLIDE_PACKAGE = "@inlang/paraglide-js";
const SHARED_PACKAGE_PATHS = [
  "apps/native/package.json",
  "apps/server/package.json",
  "apps/desktop/package.json",
] as const;

function paraglideCompileCommand(project: string, outdir: string): string {
  return `bunx ${PARAGLIDE_PACKAGE} compile --project ${project} --outdir ${outdir}`;
}

function addWorkspaceDependency(
  vfs: VirtualFileSystem,
  config: ProjectConfig,
  packagePath: string,
): void {
  if (!vfs.exists(packagePath)) return;
  const version = config.packageManager === "npm" ? "*" : "workspace:*";
  addPackageDependency({
    vfs,
    packagePath,
    customDependencies: { [`@${config.projectName}/i18n`]: version },
  });
}

function addCompilerDependency(vfs: VirtualFileSystem, packagePath: string): void {
  if (!vfs.exists(packagePath)) return;
  addPackageDependency({
    vfs,
    packagePath,
    devDependencies: [PARAGLIDE_PACKAGE, "typescript"],
  });
}

function prefixScript(
  vfs: VirtualFileSystem,
  packagePath: string,
  scriptName: string,
  prefix: string,
): void {
  const pkg = vfs.readJson<PackageJson>(packagePath);
  if (!pkg) return;

  const scripts = pkg.scripts ?? {};
  const current = scripts[scriptName];
  if (!current || current.includes(prefix)) return;

  scripts[scriptName] = `${prefix} && ${current}`;
  pkg.scripts = scripts;
  vfs.writeJson(packagePath, pkg);
}

function addNextWebpackFlag(vfs: VirtualFileSystem, packagePath: string): void {
  const pkg = vfs.readJson<PackageJson>(packagePath);
  if (!pkg?.scripts) return;

  // Next 16 uses Turbopack by default; `paraglideWebpackPlugin` needs webpack.
  for (const scriptName of ["dev", "build"]) {
    const script = pkg.scripts[scriptName];
    if (script && script.includes("next ") && !script.includes("--webpack")) {
      pkg.scripts[scriptName] = `${script} --webpack`;
    }
  }

  vfs.writeJson(packagePath, pkg);
}

/**
 * Adds `@inlang/paraglide-js` and the workspace `@<project>/i18n` dependency to
 * every app that compiles or reads Paraglide messages. WXT and OpenTUI are
 * scaffolded after generation, so their workspaces are wired by the CLI
 * post-steps instead.
 */
export function addParaglideDependencies(
  vfs: VirtualFileSystem,
  config: ProjectConfig,
  webApp: ParaglideWebApp | undefined,
): void {
  // Compiler, TypeScript declarations and the shared `i18n:compile` step.
  addCompilerDependency(vfs, "packages/i18n/package.json");

  if (webApp) {
    addWorkspaceDependency(vfs, config, "apps/web/package.json");
    addCompilerDependency(vfs, "apps/web/package.json");
    if (webApp.surface === "next") {
      addNextWebpackFlag(vfs, "apps/web/package.json");
    }
  }

  for (const packagePath of SHARED_PACKAGE_PATHS) {
    addWorkspaceDependency(vfs, config, packagePath);
    addCompilerDependency(vfs, packagePath);
  }
}

/**
 * Prepends the Paraglide compile to every consumer's `check-types`.
 *
 * The generated output is not committed and the curated type checks run
 * without a prior build, so the compile must run first for the
 * `@<project>/i18n` imports (and the app-local generated modules) to resolve.
 */
export function upgradeCheckTypes(
  vfs: VirtualFileSystem,
  webApp: ParaglideWebApp | undefined,
): void {
  prefixScript(
    vfs,
    "packages/i18n/package.json",
    "check-types",
    paraglideCompileCommand("./project.inlang", "./src/paraglide"),
  );

  if (webApp) {
    prefixScript(
      vfs,
      "apps/web/package.json",
      "check-types",
      paraglideCompileCommand("../../packages/i18n/project.inlang", webApp.outdir),
    );
  }

  for (const packagePath of SHARED_PACKAGE_PATHS) {
    prefixScript(
      vfs,
      packagePath,
      "check-types",
      paraglideCompileCommand(
        "../../packages/i18n/project.inlang",
        "../../packages/i18n/src/paraglide",
      ),
    );
  }
}
