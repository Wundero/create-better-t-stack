import type { ProjectConfig } from "@better-t-stack/types";
import { parse, stringify } from "yaml";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { getPrismaWebsiteFramework } from "../generators/alchemy/plan";
import { addPackageDependency, dependencyVersionMap } from "../utils/add-deps";

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
  if (config.emailDeploy === "ses") {
    addPackageDependency({
      vfs,
      packagePath: infraPath,
      dependencies: ["@aws-sdk/client-sesv2"],
    });
  }
  if (
    ["cloudflare", "prisma"].includes(serverDeploy) ||
    ["cloudflare", "prisma"].includes(webDeploy) ||
    config.addons.includes("axiom") ||
    config.emailDeploy === "ses"
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
}
