/**
 * Catalogs post-processor
 * Deduplicates dependencies across packages using pnpm/bun catalogs
 */

import type { ProjectConfig } from "@wundero/create-better-t-stack-types";
import yaml from "yaml";

import type { VirtualFileSystem } from "../core/virtual-fs";

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[]; catalog?: Record<string, string> };
  packageManager?: string;
  [key: string]: unknown;
};

type CatalogEntry = {
  versions: Set<string>;
  packages: string[];
};

type PackageInfo = {
  path: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

// Protocols that should never be catalogued
const EXCLUDED_PROTOCOLS = ["workspace:", "file:", "link:", "portal:", "catalog:"];

function hasExcludedProtocol(version: string): boolean {
  return EXCLUDED_PROTOCOLS.some((protocol) => version.startsWith(protocol));
}

/**
 * Discover workspace package directories from workspace globs.
 * Supports both Bun (package.json workspaces) and pnpm (pnpm-workspace.yaml).
 */
function discoverWorkspacePackages(vfs: VirtualFileSystem): string[] {
  const packages: string[] = [];

  // Try package.json workspaces first (Bun style)
  const rootPkg = vfs.readJson<PackageJson>("package.json");
  const workspaceGlobs: string[] = [];

  if (rootPkg?.workspaces) {
    if (Array.isArray(rootPkg.workspaces)) {
      workspaceGlobs.push(...rootPkg.workspaces);
    } else if (typeof rootPkg.workspaces === "object" && rootPkg.workspaces.packages) {
      workspaceGlobs.push(...rootPkg.workspaces.packages);
    }
  }

  // Also check pnpm-workspace.yaml (pnpm style)
  const pnpmWorkspaceContent = vfs.readFile("pnpm-workspace.yaml");
  if (pnpmWorkspaceContent) {
    try {
      const pnpmWorkspace = yaml.parse(pnpmWorkspaceContent) as {
        packages?: string[];
      };
      if (pnpmWorkspace.packages) {
        workspaceGlobs.push(...pnpmWorkspace.packages);
      }
    } catch {
      // Ignore YAML parse errors
    }
  }

  // Always include root package
  packages.push(".");

  // Expand globs like "apps/*", "packages/*"
  for (const glob of workspaceGlobs) {
    if (glob.endsWith("/*")) {
      const baseDir = glob.slice(0, -2); // Remove "/*"
      if (vfs.directoryExists(baseDir)) {
        const entries = vfs.listDir(baseDir);
        for (const entry of entries) {
          const pkgPath = `${baseDir}/${entry}`;
          // Only include directories that have a package.json
          if (vfs.fileExists(`${pkgPath}/package.json`)) {
            packages.push(pkgPath);
          }
        }
      }
    } else if (glob !== "." && vfs.fileExists(`${glob}/package.json`)) {
      // Exact path with package.json
      packages.push(glob);
    }
  }

  // Deduplicate while preserving order
  return [...new Set(packages)];
}

/**
 * Process dependency catalogs for pnpm/bun
 */
export function processCatalogs(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (config.packageManager === "npm") return;

  const packagesInfo: PackageInfo[] = [];

  // Dynamically discover workspace packages instead of using static list
  const packagePaths = discoverWorkspacePackages(vfs);

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

  const catalog = findDuplicateDependencies(packagesInfo, config.packageScope);

  if (Object.keys(catalog).length === 0) return;

  if (config.packageManager === "bun") {
    setupBunCatalogs(vfs, catalog);
  } else if (config.packageManager === "pnpm") {
    setupPnpmCatalogs(vfs, catalog);
  }

  updatePackageJsonsWithCatalogs(vfs, packagesInfo, catalog);
}

function findDuplicateDependencies(
  packagesInfo: PackageInfo[],
  packageScope: string,
): Record<string, string> {
  const depCount = new Map<string, CatalogEntry>();
  const projectScope = `${packageScope}/`;

  for (const pkg of packagesInfo) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [depName, version] of Object.entries(allDeps)) {
      if (depName.startsWith(projectScope)) continue;
      if (hasExcludedProtocol(version)) continue;

      const existing = depCount.get(depName);
      if (existing) {
        existing.versions.add(version);
        existing.packages.push(pkg.path);
      } else {
        depCount.set(depName, {
          versions: new Set([version]),
          packages: [pkg.path],
        });
      }
    }
  }

  const catalog: Record<string, string> = {};
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
  } else if (typeof pkgJson.workspaces === "object") {
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

    let updated = false;

    if (pkgJson.dependencies) {
      for (const depName of Object.keys(pkgJson.dependencies)) {
        if (catalog[depName]) {
          (pkgJson.dependencies as Record<string, string>)[depName] = "catalog:";
          updated = true;
        }
      }
    }

    if (pkgJson.devDependencies) {
      for (const depName of Object.keys(pkgJson.devDependencies)) {
        if (catalog[depName]) {
          (pkgJson.devDependencies as Record<string, string>)[depName] = "catalog:";
          updated = true;
        }
      }
    }

    if (updated) {
      vfs.writeJson(jsonPath, pkgJson);
    }
  }
}
