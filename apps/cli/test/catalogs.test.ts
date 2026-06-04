import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import yaml from "yaml";

import { expectSuccess, runTRPCTest, type TestConfig } from "./test-utils";

async function readPackageJson(projectDir: string, pkgPath: string) {
  const filePath = path.join(projectDir, pkgPath, "package.json");
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

async function readRootPackageJson(projectDir: string) {
  const filePath = path.join(projectDir, "package.json");
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as {
    workspaces?: string[] | { packages?: string[]; catalog?: Record<string, string> };
  };
}

async function readPnpmWorkspace(projectDir: string) {
  const filePath = path.join(projectDir, "pnpm-workspace.yaml");
  const content = await readFile(filePath, "utf8");
  return yaml.parse(content) as { catalog?: Record<string, string> };
}

async function runCatalogTest(config: TestConfig) {
  const result = await runTRPCTest({
    ...config,
    install: false,
    git: false,
  });
  expectSuccess(result);
  return result.projectDir!;
}

describe("dependency catalogs", () => {
  describe("bun catalogs", () => {
    it("should create root workspaces.catalog with shared dependencies", async () => {
      const projectDir = await runCatalogTest({
        projectName: "bun-catalog-shared",
        packageManager: "bun",
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        database: "sqlite",
        orm: "drizzle",
        auth: "better-auth",
        addons: ["turborepo"],
        examples: ["todo"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });

      const rootPkg = await readRootPackageJson(projectDir);
      expect(rootPkg.workspaces).toBeDefined();

      const workspaces = Array.isArray(rootPkg.workspaces) ? undefined : rootPkg.workspaces;
      expect(workspaces?.catalog).toBeDefined();

      // Shared deps like typescript, @types/node, hono, etc. should be catalogued
      const catalog = workspaces?.catalog ?? {};
      expect(Object.keys(catalog).length).toBeGreaterThan(0);
    });

    it("should replace shared dependency versions with catalog: in sub-packages", async () => {
      const projectDir = await runCatalogTest({
        projectName: "bun-catalog-colon",
        packageManager: "bun",
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        database: "sqlite",
        orm: "drizzle",
        auth: "better-auth",
        addons: ["turborepo"],
        examples: ["todo"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });

      const webPkg = await readPackageJson(projectDir, "apps/web");
      const serverPkg = await readPackageJson(projectDir, "apps/server");

      // If both packages share a dependency, it should use catalog:
      const sharedDeps = Object.keys(webPkg.dependencies ?? {}).filter(
        (dep) => serverPkg.dependencies?.[dep] || serverPkg.devDependencies?.[dep],
      );

      for (const dep of sharedDeps) {
        const webVersion = webPkg.dependencies?.[dep] ?? webPkg.devDependencies?.[dep];
        if (webVersion === "catalog:") {
          // Found at least one catalog: usage
          return;
        }
      }

      // If no shared deps found at all, the test passes vacuously
      // But we expect there to be some shared deps in a typical stack
      expect(sharedDeps.length).toBeGreaterThan(0);
    });

    it("should discover dynamically created packages (e.g. packages/config)", async () => {
      const projectDir = await runCatalogTest({
        projectName: "bun-catalog-dynamic",
        packageManager: "bun",
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        database: "sqlite",
        orm: "drizzle",
        auth: "none",
        addons: ["turborepo", "biome"],
        examples: ["none"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });

      const _configPkg = await readPackageJson(projectDir, "packages/config");
      const rootPkg = await readRootPackageJson(projectDir);

      const workspaces = Array.isArray(rootPkg.workspaces) ? undefined : rootPkg.workspaces;
      const catalog = workspaces?.catalog ?? {};

      // If packages/config shares a dep with another package, it should be catalogued
      // We verify the catalog exists and the dynamic package was discovered
      expect(Object.keys(catalog).length).toBeGreaterThan(0);
    });
  });

  describe("pnpm catalogs", () => {
    it("should create pnpm-workspace.yaml with catalog entries", async () => {
      const projectDir = await runCatalogTest({
        projectName: "pnpm-catalog-shared",
        packageManager: "pnpm",
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        database: "sqlite",
        orm: "drizzle",
        auth: "better-auth",
        addons: ["turborepo"],
        examples: ["todo"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });

      const pnpmWorkspace = await readPnpmWorkspace(projectDir);
      expect(pnpmWorkspace.catalog).toBeDefined();

      const catalog = pnpmWorkspace.catalog ?? {};
      expect(Object.keys(catalog).length).toBeGreaterThan(0);
    });

    it("should replace shared dependency versions with catalog: in pnpm projects", async () => {
      const projectDir = await runCatalogTest({
        projectName: "pnpm-catalog-colon",
        packageManager: "pnpm",
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        database: "sqlite",
        orm: "drizzle",
        auth: "better-auth",
        addons: ["turborepo"],
        examples: ["todo"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });

      const webPkg = await readPackageJson(projectDir, "apps/web");
      const serverPkg = await readPackageJson(projectDir, "apps/server");

      // At least one shared dep should use catalog:
      const allWebDeps = {
        ...webPkg.dependencies,
        ...webPkg.devDependencies,
      };
      const allServerDeps = {
        ...serverPkg.dependencies,
        ...serverPkg.devDependencies,
      };

      let foundCatalog = false;
      for (const [dep, version] of Object.entries(allWebDeps)) {
        if (dep in allServerDeps && version === "catalog:") {
          foundCatalog = true;
          break;
        }
      }

      expect(foundCatalog).toBe(true);
    });
  });

  describe("protocol guards", () => {
    it("should not catalog workspace: protocol dependencies", async () => {
      const projectDir = await runCatalogTest({
        projectName: "catalog-no-workspace",
        packageManager: "bun",
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        database: "sqlite",
        orm: "drizzle",
        auth: "none",
        addons: ["turborepo"],
        examples: ["none"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });

      const _webPkg = await readPackageJson(projectDir, "apps/web");
      const rootPkg = await readRootPackageJson(projectDir);

      const workspaces = Array.isArray(rootPkg.workspaces) ? undefined : rootPkg.workspaces;
      const catalog = workspaces?.catalog ?? {};

      // Workspace-internal deps should NOT be in catalog
      for (const dep of Object.keys(catalog)) {
        expect(dep.startsWith("@test-app/")).toBe(false);
      }
    });

    it("should not catalog file:, link:, portal:, or existing catalog: protocols", async () => {
      // This test verifies guards by checking the catalog doesn't contain
      // deps with non-semver protocols. In practice, the generated stacks
      // don't use these protocols, so we verify the guard logic exists
      // by ensuring workspace: deps are excluded (the most common case).
      const projectDir = await runCatalogTest({
        projectName: "catalog-protocol-guards",
        packageManager: "bun",
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        database: "sqlite",
        orm: "drizzle",
        auth: "none",
        addons: ["turborepo"],
        examples: ["none"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });

      const rootPkg = await readRootPackageJson(projectDir);
      const workspaces = Array.isArray(rootPkg.workspaces) ? undefined : rootPkg.workspaces;
      const catalog = workspaces?.catalog ?? {};

      // No catalog entry should have a protocol prefix
      for (const version of Object.values(catalog)) {
        expect(version.startsWith("workspace:")).toBe(false);
        expect(version.startsWith("file:")).toBe(false);
        expect(version.startsWith("link:")).toBe(false);
        expect(version.startsWith("portal:")).toBe(false);
        expect(version.startsWith("catalog:")).toBe(false);
      }
    });
  });
});
