import { isAlchemyDeployTarget, isProviderAddon, type ProjectConfig } from "@better-t-stack/types";
import { parse, stringify } from "yaml";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { addonInfraDeps } from "../generators/alchemy/addons";
import { createAlchemyDeploymentPlan, getPrismaWebsiteFramework } from "../generators/alchemy/plan";
import {
  addPackageDependency,
  dependencyVersionMap,
  type AvailableDependencies,
} from "../utils/add-deps";

// `@effect/platform-node`/`-bun` declare `@effect/platform-node-shared` with a caret on a
// prerelease, and alchemy floats several `@effect/*` deps. Those ranges resolve to the newest
// rc while the direct deps stay pinned, so alchemy loads a mixed rc set and crashes at startup.
const ALCHEMY_FLOATED_EFFECT_PACKAGES = [
  "@effect/platform-node-shared",
  "@effect/sql-d1",
  "@effect/sql-sqlite-do",
  "@effect/vitest",
];

function alignAlchemyEffectPackages(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const effectVersion = dependencyVersionMap["@effect/platform-node"];
  const overrides = Object.fromEntries(
    ALCHEMY_FLOATED_EFFECT_PACKAGES.map((name) => [name, effectVersion]),
  );

  if (config.packageManager === "pnpm") {
    const path = "pnpm-workspace.yaml";
    const workspace = parse(vfs.readFile(path) ?? "") ?? {};
    workspace.overrides = { ...workspace.overrides, ...overrides };
    vfs.writeFile(path, stringify(workspace));
    return;
  }

  const pkg = vfs.readJson<{ overrides?: Record<string, string> }>("package.json");
  if (!pkg) return;
  pkg.overrides = { ...pkg.overrides, ...overrides };
  vfs.writeJson("package.json", pkg);
}

function isAvailableDependency(name: string): name is AvailableDependencies {
  return Object.hasOwn(dependencyVersionMap, name);
}

function addonDevDependencies(config: ProjectConfig): AvailableDependencies[] {
  if (!config.addons.some(isProviderAddon)) return [];
  const plan = createAlchemyDeploymentPlan(config);
  return addonInfraDeps(plan).map((name) => {
    if (!isAvailableDependency(name)) {
      throw new Error(
        `Missing version for dependency: ${name}. Add it to dependencyVersionMap in add-deps.ts`,
      );
    }
    return name;
  });
}

export function processInfraDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const infraPath = "packages/infra/package.json";
  if (!vfs.exists(infraPath)) return;

  const { serverDeploy, webDeploy } = config;
  if (webDeploy === "prisma" || webDeploy === "aws") {
    addPackageDependency({
      vfs,
      packagePath: infraPath,
      devDependencies: ["@alchemy.run/frontend-frameworks"],
    });
  }
  if (getPrismaWebsiteFramework(config)) {
    addPackageDependency({
      vfs,
      packagePath: infraPath,
      devDependencies: ["@vercel/nft"],
    });
  }
  if (
    isAlchemyDeployTarget(serverDeploy) ||
    isAlchemyDeployTarget(webDeploy) ||
    config.addons.includes("axiom")
  ) {
    addPackageDependency({
      vfs,
      packagePath: infraPath,
      devDependencies: [
        "alchemy",
        "effect",
        "@effect/platform-node",
        "@effect/platform-bun",
        "varlock",
      ],
    });
    alignAlchemyEffectPackages(vfs, config);
  }

  const addonDeps = addonDevDependencies(config);
  if (addonDeps.length > 0) {
    addPackageDependency({
      vfs,
      packagePath: infraPath,
      devDependencies: addonDeps,
    });
  }
}
