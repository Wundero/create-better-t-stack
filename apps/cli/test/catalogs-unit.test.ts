import { describe, expect, it } from "bun:test";

import { VirtualFileSystem } from "../../../packages/template-generator/src/core/virtual-fs";
import { processCatalogs } from "../../../packages/template-generator/src/post-process/catalogs";
import type { ProjectConfig } from "../../../packages/types/src";

function createTestConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "test-app",
    packageScope: "test-app",
    packageManager: "bun",
    frontend: ["tanstack-router"],
    backend: "hono",
    runtime: "bun",
    api: "trpc",
    database: "sqlite",
    orm: "drizzle",
    auth: "none",
    addons: ["none"],
    examples: ["none"],
    dbSetup: "none",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  } as ProjectConfig;
}

describe("catalogs unit tests", () => {
  it("should dynamically discover packages from workspace globs (apps/*, packages/*)", () => {
    const vfs = new VirtualFileSystem();

    // Root package.json with workspaces config
    vfs.writeJson("package.json", {
      name: "test-app",
      workspaces: ["apps/*", "packages/*"],
      dependencies: {},
    });

    // Existing packages in static list
    vfs.writeJson("apps/web/package.json", {
      name: "@test-app/web",
      dependencies: { hono: "4.0.0" },
    });

    vfs.writeJson("apps/server/package.json", {
      name: "@test-app/server",
      dependencies: { hono: "4.0.0" },
    });

    vfs.writeJson("apps/server/package.json", {
      name: "@test-app/server",
      dependencies: { hono: "4.0.0", "another-dep": "2.0.0" },
    });

    // NEW package NOT in the old static PACKAGE_PATHS list
    vfs.writeJson("packages/email/package.json", {
      name: "@test-app/email",
      dependencies: { hono: "4.0.0", react: "18.0.0" },
    });

    // Another new package
    vfs.writeJson("apps/tauri/package.json", {
      name: "@test-app/tauri",
      dependencies: { hono: "4.0.0", tauri: "1.0.0" },
    });

    const config = createTestConfig();
    processCatalogs(vfs, config);

    // Root should have catalog with hono (shared across 4 packages)
    const rootPkg = vfs.readJson<{
      workspaces?: { catalog?: Record<string, string> };
    }>("package.json");
    expect(rootPkg?.workspaces).toBeDefined();
    expect(rootPkg?.workspaces?.catalog).toBeDefined();
    expect(rootPkg?.workspaces?.catalog?.hono).toBe("4.0.0");

    // The dynamically discovered packages should also have catalog: references
    const emailPkg = vfs.readJson<{
      dependencies?: Record<string, string>;
    }>("packages/email/package.json");
    expect(emailPkg?.dependencies?.hono).toBe("catalog:");

    const tauriPkg = vfs.readJson<{
      dependencies?: Record<string, string>;
    }>("apps/tauri/package.json");
    expect(tauriPkg?.dependencies?.hono).toBe("catalog:");
  });

  it("should not discover packages without package.json", () => {
    const vfs = new VirtualFileSystem();

    vfs.writeJson("package.json", {
      name: "test-app",
      workspaces: ["apps/*", "packages/*"],
    });

    vfs.writeJson("apps/web/package.json", {
      name: "@test-app/web",
      dependencies: { hono: "4.0.0" },
    });

    vfs.writeJson("apps/server/package.json", {
      name: "@test-app/server",
      dependencies: { hono: "4.0.0" },
    });

    // Empty directory with no package.json
    vfs.mkdir("apps/empty-dir");

    const config = createTestConfig();
    processCatalogs(vfs, config);

    // Should still work, just ignoring the empty dir
    const rootPkg = vfs.readJson<{
      workspaces?: { catalog?: Record<string, string> };
    }>("package.json");
    expect(rootPkg?.workspaces?.catalog).toBeDefined();
  });

  it("should guard against file:, link:, portal:, and catalog: protocols", () => {
    const vfs = new VirtualFileSystem();

    vfs.writeJson("package.json", {
      name: "test-app",
      workspaces: ["apps/*", "packages/*"],
    });

    vfs.writeJson("apps/web/package.json", {
      name: "@test-app/web",
      dependencies: {
        hono: "4.0.0",
        "local-pkg": "file:../local-pkg",
        "linked-pkg": "link:../linked-pkg",
        "portal-pkg": "portal:../portal-pkg",
        "already-catalog": "catalog:",
      },
    });

    vfs.writeJson("apps/server/package.json", {
      name: "@test-app/server",
      dependencies: {
        hono: "4.0.0",
        "local-pkg": "file:../local-pkg",
        "linked-pkg": "link:../linked-pkg",
      },
    });

    const config = createTestConfig();
    processCatalogs(vfs, config);

    const rootPkg = vfs.readJson<{
      workspaces?: { catalog?: Record<string, string> };
    }>("package.json");
    const catalog = rootPkg?.workspaces?.catalog ?? {};

    // hono is shared with semver version, should be catalogued
    expect(catalog.hono).toBe("4.0.0");

    // Protocol deps should NOT be catalogued
    expect(catalog["local-pkg"]).toBeUndefined();
    expect(catalog["linked-pkg"]).toBeUndefined();
    expect(catalog["portal-pkg"]).toBeUndefined();
    expect(catalog["already-catalog"]).toBeUndefined();
  });

  it("should discover packages from object-style workspaces.packages", () => {
    const vfs = new VirtualFileSystem();

    vfs.writeJson("package.json", {
      name: "test-app",
      workspaces: {
        packages: ["apps/*", "packages/*"],
      },
    });

    vfs.writeJson("packages/new-package/package.json", {
      name: "@test-app/new-package",
      dependencies: { hono: "4.0.0" },
    });

    vfs.writeJson("apps/web/package.json", {
      name: "@test-app/web",
      dependencies: { hono: "4.0.0" },
    });

    const config = createTestConfig();
    processCatalogs(vfs, config);

    const rootPkg = vfs.readJson<{
      workspaces?: { catalog?: Record<string, string> };
    }>("package.json");
    expect(rootPkg?.workspaces?.catalog?.hono).toBe("4.0.0");
  });

  it("should handle pnpm-workspace.yaml for pnpm package manager", () => {
    const vfs = new VirtualFileSystem();

    vfs.writeJson("package.json", {
      name: "test-app",
      workspaces: ["apps/*", "packages/*"],
    });

    vfs.writeFile(
      "pnpm-workspace.yaml",
      `packages:
  - "apps/*"
  - "packages/*"
`,
    );

    vfs.writeJson("packages/email/package.json", {
      name: "@test-app/email",
      dependencies: { hono: "4.0.0" },
    });

    vfs.writeJson("apps/web/package.json", {
      name: "@test-app/web",
      dependencies: { hono: "4.0.0" },
    });

    const config = createTestConfig({ packageManager: "pnpm" });
    processCatalogs(vfs, config);

    // For pnpm, we should detect packages even without root package.json workspaces
    const pnpmWorkspace = vfs.readFile("pnpm-workspace.yaml");
    expect(pnpmWorkspace).toContain("catalog:");

    const parsed = vfs.readJson<{
      dependencies?: Record<string, string>;
    }>("packages/email/package.json");
    expect(parsed?.dependencies?.hono).toBe("catalog:");
  });
});
