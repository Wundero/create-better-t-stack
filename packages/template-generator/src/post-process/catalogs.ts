/**
 * Catalogs post-processor
 * Deduplicates dependencies across packages using pnpm/bun catalogs
 */

import type { PackageManager } from "@better-t-stack/types";
import yaml from "yaml";

import type { JsonValue } from "../core/json-types";
import type { VirtualFileSystem } from "../core/virtual-fs";
import { CATALOG_PACKAGE_PATHS } from "../generators/workspace-paths";

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[]; catalog?: Record<string, string> };
  packageManager?: string;
  [key: string]: JsonValue | undefined;
};

type CatalogEntry = {
  versions: Set<string>;
  packages: string[];
};

interface DependencyCatalog extends Record<string, string> {}

type PackageInfo = {
  path: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

type PnpmWorkspaceYaml = {
  catalog?: Record<string, string>;
};

type NotNpmPackageManager = Exclude<PackageManager, "npm">;

export interface CatalogConfig {
  packageManager: PackageManager;
  projectName: string;
}

/**
 * Process dependency catalogs for pnpm/bun
 */
export function processCatalogs(
  vfs: VirtualFileSystem,
  config: CatalogConfig,
  extraPackageDirs: readonly string[] = [],
): void {
  if (config.packageManager === "npm") return;

  // Bun catalogs live in the root package.json; without one, rewriting refs to
  // `catalog:` would create dangling references.
  if (config.packageManager === "bun" && !vfs.exists("package.json")) return;

  const packagePaths = [...new Set<string>([...CATALOG_PACKAGE_PATHS, ...extraPackageDirs])];
  const packagesInfo: PackageInfo[] = [];

  for (const pkgPath of packagePaths) {
    const jsonPath = pkgPath === "." ? "package.json" : `${pkgPath}/package.json`;
    const pkgJson = vfs.readJson<PackageJson>(jsonPath);

    if (pkgJson) {
      packagesInfo.push({
        path: pkgPath,
        dependencies: (pkgJson.dependencies || {}) as Record<string, string>,
        devDependencies: (pkgJson.devDependencies || {}) as Record<string, string>,
      });
    }
  }

  const existingCatalog = readExistingCatalog(vfs, config.packageManager);
  const catalog = findDuplicateDependencies(packagesInfo, config.projectName, existingCatalog);
  const mergedCatalog: DependencyCatalog = { ...existingCatalog, ...catalog };

  if (Object.keys(mergedCatalog).length === 0) return;

  if (config.packageManager === "bun") {
    setupBunCatalogs(vfs, mergedCatalog);
  } else if (config.packageManager === "pnpm") {
    setupPnpmCatalogs(vfs, mergedCatalog);
  }

  updatePackageJsonsWithCatalogs(vfs, packagesInfo, mergedCatalog);
}

function readExistingCatalog(
  vfs: VirtualFileSystem,
  packageManager: NotNpmPackageManager,
): DependencyCatalog {
  switch (packageManager) {
    case "pnpm":
      return readPnpmCatalog(vfs);
    case "bun":
      return readBunCatalog(vfs);
  }
}

function readPnpmCatalog(vfs: VirtualFileSystem): DependencyCatalog {
  const content = vfs.readFile("pnpm-workspace.yaml");
  if (!content) return {};

  const workspaceYaml: PnpmWorkspaceYaml = yaml.parse(content);
  return workspaceYaml.catalog ?? {};
}

function readBunCatalog(vfs: VirtualFileSystem): DependencyCatalog {
  const pkgJson = vfs.readJson<PackageJson>("package.json");
  if (!pkgJson) return {};

  const workspaces = pkgJson.workspaces;
  if (!workspaces || Array.isArray(workspaces)) return {};

  return workspaces.catalog ?? {};
}

function findDuplicateDependencies(
  packagesInfo: PackageInfo[],
  projectName: string,
  existingCatalog: Record<string, string>,
): DependencyCatalog {
  const depCount = new Map<string, CatalogEntry>();
  const projectScope = `@${projectName}/`;

  for (const pkg of packagesInfo) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [depName, version] of Object.entries(allDeps)) {
      if (depName.startsWith(projectScope)) continue;
      if (version.startsWith("workspace:")) continue;
      // Named catalog refs (`catalog:foo`) resolve through their own catalog,
      // so they must never be folded into the default catalog.
      if (version.startsWith("catalog:") && version !== "catalog:") continue;

      const resolvedVersion = version === "catalog:" ? existingCatalog[depName] : version;
      if (resolvedVersion === undefined) continue;

      const existing = depCount.get(depName);
      if (existing) {
        existing.versions.add(resolvedVersion);
        existing.packages.push(pkg.path);
      } else {
        depCount.set(depName, {
          versions: new Set([resolvedVersion]),
          packages: [pkg.path],
        });
      }
    }
  }

  const catalog: DependencyCatalog = {};
  for (const [depName, info] of depCount.entries()) {
    if (info.packages.length > 1 && info.versions.size === 1) {
      const version = Array.from(info.versions)[0];
      if (version) {
        catalog[depName] = version;
      }
    }
  }

  return catalog;
}

function setupBunCatalogs(vfs: VirtualFileSystem, catalog: Record<string, string>): void {
  const pkgJson = vfs.readJson<PackageJson>("package.json");
  if (!pkgJson) return;

  if (!pkgJson.workspaces) {
    pkgJson.workspaces = {};
  }

  if (Array.isArray(pkgJson.workspaces)) {
    pkgJson.workspaces = {
      packages: pkgJson.workspaces,
      catalog,
    };
  } else {
    if (!pkgJson.workspaces.catalog) {
      pkgJson.workspaces.catalog = {};
    }
    pkgJson.workspaces.catalog = {
      ...pkgJson.workspaces.catalog,
      ...catalog,
    };
  }

  vfs.writeJson("package.json", pkgJson);
}

function setupPnpmCatalogs(vfs: VirtualFileSystem, catalog: Record<string, string>): void {
  let content = vfs.readFile("pnpm-workspace.yaml");

  // Create pnpm-workspace.yaml if it doesn't exist
  if (!content) {
    content = `packages:
  - "apps/*"
  - "packages/*"
`;
    vfs.writeFile("pnpm-workspace.yaml", content);
  }

  const workspaceYaml = yaml.parse(content);

  if (!workspaceYaml.catalog) {
    workspaceYaml.catalog = {};
  }

  workspaceYaml.catalog = {
    ...workspaceYaml.catalog,
    ...catalog,
  };

  vfs.writeFile("pnpm-workspace.yaml", yaml.stringify(workspaceYaml));
}

function updatePackageJsonsWithCatalogs(
  vfs: VirtualFileSystem,
  packagesInfo: PackageInfo[],
  catalog: Record<string, string>,
): void {
  for (const pkg of packagesInfo) {
    const jsonPath = pkg.path === "." ? "package.json" : `${pkg.path}/package.json`;
    const pkgJson = vfs.readJson<PackageJson>(jsonPath);
    if (!pkgJson) continue;

    const dependenciesUpdated = pkgJson.dependencies
      ? setMatchingCatalogReferences(pkgJson.dependencies, catalog)
      : false;
    const devDependenciesUpdated = pkgJson.devDependencies
      ? setMatchingCatalogReferences(pkgJson.devDependencies, catalog)
      : false;

    if (dependenciesUpdated || devDependenciesUpdated) {
      vfs.writeJson(jsonPath, pkgJson);
    }
  }
}

function setMatchingCatalogReferences(
  dependencies: Record<string, string>,
  catalog: Record<string, string>,
): boolean {
  let updated = false;

  for (const [depName, version] of Object.entries(dependencies)) {
    if (version === "catalog:") continue;
    if (catalog[depName] !== version) continue;

    dependencies[depName] = "catalog:";
    updated = true;
  }

  return updated;
}
