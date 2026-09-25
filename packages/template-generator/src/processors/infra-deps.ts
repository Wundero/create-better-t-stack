import { isAlchemyDeployTarget, type ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { getPrismaWebsiteFramework } from "../generators/alchemy/plan";
import { addPackageDependency } from "../utils/add-deps";

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
  }
}
