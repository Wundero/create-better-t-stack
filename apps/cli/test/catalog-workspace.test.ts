import { describe, expect, it } from "bun:test";

import yaml from "yaml";

import { VirtualFileSystem } from "../../../packages/template-generator/src/core/virtual-fs";
import {
  processCatalogs,
  type CatalogConfig,
} from "../../../packages/template-generator/src/post-process/catalogs";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type RootPackageJson = PackageJson & {
  workspaces?: string[] | { packages?: string[]; catalog?: Record<string, string> };
};

type PnpmWorkspaceYaml = {
  catalog?: Record<string, string>;
};

const bunConfig: CatalogConfig = { packageManager: "bun", projectName: "acme" };

function readDependencies(vfs: VirtualFileSystem, jsonPath: string): Record<string, string> {
  return vfs.readJson<PackageJson>(jsonPath)?.dependencies ?? {};
}

function readBunCatalog(vfs: VirtualFileSystem): Record<string, string> {
  const workspaces = vfs.readJson<RootPackageJson>("package.json")?.workspaces;
  if (!workspaces || Array.isArray(workspaces)) {
    throw new Error("expected root package.json workspaces to be a catalog object");
  }
  return workspaces.catalog ?? {};
}

function readPnpmCatalog(vfs: VirtualFileSystem): Record<string, string> {
  const workspace: PnpmWorkspaceYaml = yaml.parse(vfs.readFile("pnpm-workspace.yaml") ?? "");
  return workspace.catalog ?? {};
}

describe("catalog workspace post-processing", () => {
  it("adds a newly generated package dir to a fresh bun catalog", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("package.json", {});
    vfs.writeJson("apps/web/package.json", { dependencies: { next: "^16.3.4" } });
    vfs.writeJson("apps/admin/package.json", { dependencies: { next: "^16.3.4" } });

    processCatalogs(vfs, bunConfig, ["apps/admin"]);

    expect(readBunCatalog(vfs).next).toBe("^16.3.4");
    expect(readDependencies(vfs, "apps/web/package.json").next).toBe("catalog:");
    expect(readDependencies(vfs, "apps/admin/package.json").next).toBe("catalog:");
  });

  it("honors the existing bun catalog when resolving catalog: references", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("package.json", {
      workspaces: { packages: ["apps/*", "packages/*"], catalog: { next: "^16.3.4" } },
    });
    vfs.writeJson("apps/web/package.json", { dependencies: { next: "catalog:" } });
    vfs.writeJson("apps/admin/package.json", { dependencies: { next: "^16.3.4" } });

    processCatalogs(vfs, bunConfig, ["apps/admin"]);

    expect(readBunCatalog(vfs).next).toBe("^16.3.4");
    expect(readDependencies(vfs, "apps/web/package.json").next).toBe("catalog:");
    expect(readDependencies(vfs, "apps/admin/package.json").next).toBe("catalog:");
  });

  it("honors the existing pnpm catalog when resolving catalog: references", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeFile(
      "pnpm-workspace.yaml",
      yaml.stringify({
        packages: ["apps/*", "packages/*"],
        catalog: { next: "^16.3.4" },
      }),
    );
    vfs.writeJson("package.json", {});
    vfs.writeJson("apps/web/package.json", { dependencies: { next: "catalog:" } });
    vfs.writeJson("apps/admin/package.json", { dependencies: { next: "^16.3.4" } });

    processCatalogs(vfs, { packageManager: "pnpm", projectName: "acme" }, ["apps/admin"]);

    expect(readPnpmCatalog(vfs).next).toBe("^16.3.4");
    expect(readDependencies(vfs, "apps/web/package.json").next).toBe("catalog:");
    expect(readDependencies(vfs, "apps/admin/package.json").next).toBe("catalog:");
  });

  it("is a no-op for npm", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("package.json", {});
    vfs.writeJson("apps/web/package.json", { dependencies: { next: "^16.3.4" } });
    vfs.writeJson("apps/admin/package.json", { dependencies: { next: "^16.3.4" } });
    const rootBefore = vfs.readFile("package.json");
    const adminBefore = vfs.readFile("apps/admin/package.json");

    processCatalogs(vfs, { packageManager: "npm", projectName: "acme" }, ["apps/admin"]);

    expect(vfs.readFile("package.json")).toBe(rootBefore);
    expect(vfs.readFile("apps/admin/package.json")).toBe(adminBefore);
  });

  it("never overwrites an explicit version that conflicts with the catalog", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("package.json", {
      workspaces: { packages: ["apps/*", "packages/*"], catalog: { next: "^16.3.4" } },
    });
    vfs.writeJson("apps/web/package.json", { dependencies: { next: "catalog:" } });
    vfs.writeJson("apps/admin/package.json", { dependencies: { next: "^17.0.0" } });

    processCatalogs(vfs, bunConfig, ["apps/admin"]);

    expect(readBunCatalog(vfs).next).toBe("^16.3.4");
    expect(readDependencies(vfs, "apps/web/package.json").next).toBe("catalog:");
    expect(readDependencies(vfs, "apps/admin/package.json").next).toBe("^17.0.0");
  });

  it("keeps default behavior for known package paths without extras", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("package.json", {});
    vfs.writeJson("apps/web/package.json", { dependencies: { next: "^16.3.4" } });
    vfs.writeJson("packages/api/package.json", { dependencies: { next: "^16.3.4" } });

    processCatalogs(vfs, bunConfig);

    expect(readBunCatalog(vfs).next).toBe("^16.3.4");
    expect(readDependencies(vfs, "apps/web/package.json").next).toBe("catalog:");
    expect(readDependencies(vfs, "packages/api/package.json").next).toBe("catalog:");
  });

  it("does not rewrite bun dependencies to catalog: when the root package.json is missing", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("apps/web/package.json", { dependencies: { lodash: "^4.17.21" } });
    vfs.writeJson("apps/admin/package.json", { dependencies: { lodash: "^4.17.21" } });

    processCatalogs(vfs, bunConfig, ["apps/admin"]);

    expect(vfs.exists("package.json")).toBe(false);
    expect(readDependencies(vfs, "apps/web/package.json").lodash).toBe("^4.17.21");
    expect(readDependencies(vfs, "apps/admin/package.json").lodash).toBe("^4.17.21");
  });

  it("leaves named catalog references untouched", () => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("package.json", { workspaces: { packages: ["apps/*", "packages/*"] } });
    vfs.writeJson("apps/web/package.json", { dependencies: { lodash: "catalog:foo" } });
    vfs.writeJson("apps/admin/package.json", { dependencies: { lodash: "catalog:foo" } });
    const rootBefore = vfs.readFile("package.json");

    processCatalogs(vfs, bunConfig, ["apps/admin"]);

    expect(vfs.readFile("package.json")).toBe(rootBefore);
    expect(readBunCatalog(vfs).lodash).toBeUndefined();
    expect(readDependencies(vfs, "apps/web/package.json").lodash).toBe("catalog:foo");
    expect(readDependencies(vfs, "apps/admin/package.json").lodash).toBe("catalog:foo");
  });
});
