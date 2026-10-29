import type { ProjectConfig } from "@better-t-stack/types";
import { parse, stringify } from "yaml";

import type { VirtualFileSystem } from "../core/virtual-fs";
import {
  ALCHEMY_PROVIDER_PACKAGES,
  createAlchemyDeploymentPlan,
  getAlchemyProviders,
  getPrismaWebsiteFramework,
} from "../generators/alchemy/plan";
import { addPackageDependency, dependencyVersionMap } from "../utils/add-deps";

// Alchemy declares its Effect dependencies as caret ranges (several are optional peers) and
// floats others through its own dependencies. A fresh install therefore hoists the newest
// matching release, e.g. `effect@4.1.0`, while the direct deps stay pinned to the version
// Alchemy was built against. Alchemy then loads a mixed Effect set and crashes while importing
// its platform peer (`Alchemy could not load the required peer dependency`). Pin every Effect
// package the generated infra can pull in, so one coherent version is installed everywhere.
const ALCHEMY_EFFECT_PACKAGES = [
  "effect",
  "@effect/platform-node",
  "@effect/platform-bun",
  "@effect/platform-node-shared",
  "@effect/sql-d1",
  "@effect/sql-libsql",
  "@effect/sql-mysql2",
  "@effect/sql-pg",
  "@effect/sql-sqlite-do",
  "@effect/vitest",
];

function alignAlchemyEffectPackages(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const effectVersion = dependencyVersionMap.effect;
  const overrides = Object.fromEntries(
    ALCHEMY_EFFECT_PACKAGES.map((name) => [name, effectVersion]),
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

export function processInfraDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const infraPath = "packages/infra/package.json";
  if (!vfs.exists(infraPath)) return;

  const { serverDeploy, webDeploy } = config;
  if (getPrismaWebsiteFramework(config)) {
    addPackageDependency({
      vfs,
      packagePath: infraPath,
      devDependencies: ["@alchemy.run/frontend-frameworks", "@vercel/nft"],
    });
  }
  if (
    ["cloudflare", "prisma"].includes(serverDeploy) ||
    ["cloudflare", "prisma"].includes(webDeploy) ||
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
        ...getAlchemyProviders(createAlchemyDeploymentPlan(config)).map(
          (provider) => ALCHEMY_PROVIDER_PACKAGES[provider],
        ),
      ],
    });
    alignAlchemyEffectPackages(vfs, config);
  }
}
