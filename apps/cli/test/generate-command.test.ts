import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateAppHandler, generatePackageHandler } from "../src/helpers/core/generate-handler";
import { expectSuccess, runCreateTest } from "./test-utils";
import { assertWorkspaceGraph } from "./workspace-graph";

function readPackageName(content: string): string {
  const parsed: { name?: string } = JSON.parse(content);
  return parsed.name ?? "";
}

describe("generatePackageHandler", () => {
  it("scaffolds a workspace package inside a task-runner project", async () => {
    const seeded = await runCreateTest({
      projectName: "generate-package-happy",
      addons: ["turborepo"],
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;

    const result = await generatePackageHandler(
      { projectDir, name: "shared", install: false },
      { silent: true },
    );

    expect(result?.success).toBe(true);
    expect(result?.kind).toBe("package");
    expect(result?.name).toBe("shared");
    expect(existsSync(join(projectDir, "packages", "shared", "src", "index.ts"))).toBe(true);
    expect(existsSync(join(projectDir, "packages", "shared", "tsconfig.json"))).toBe(true);

    const configPackage = readPackageName(
      await readFile(join(projectDir, "packages", "config", "package.json"), "utf8"),
    );
    const scope = configPackage.slice(0, -"/config".length);
    expect(
      readPackageName(
        await readFile(join(projectDir, "packages", "shared", "package.json"), "utf8"),
      ),
    ).toBe(`${scope}/shared`);

    await assertWorkspaceGraph(projectDir);
  });

  it("preserves every existing root devDependency when env validation is enabled", async () => {
    const seeded = await runCreateTest({
      projectName: "gen-pkg-preserve",
      addons: ["turborepo"],
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;
    const rootPackagePath = join(projectDir, "package.json");

    const before: { devDependencies?: Record<string, string> } = JSON.parse(
      await readFile(rootPackagePath, "utf8"),
    );
    const beforeDevDependencies = before.devDependencies ?? {};

    expect(beforeDevDependencies.turbo).toBeDefined();
    expect(beforeDevDependencies.typescript).toBeDefined();

    const result = await generatePackageHandler(
      { projectDir, name: "shared-env", envValidation: true, install: false },
      { silent: true },
    );

    expect(result?.success).toBe(true);

    const after: {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    } = JSON.parse(await readFile(rootPackagePath, "utf8"));

    for (const [name, version] of Object.entries(beforeDevDependencies)) {
      expect(after.devDependencies?.[name]).toBe(version);
    }
    expect(after.devDependencies?.turbo).toBe(beforeDevDependencies.turbo);
    expect(after.devDependencies?.varlock).toBeDefined();
    expect(after.scripts?.postinstall).toContain("varlock codegen --path ./packages/shared-env/");
  });

  it("catalogs a new package against the generated monorepo", async () => {
    const seeded = await runCreateTest({
      projectName: "generate-package-catalog",
      addons: ["turborepo"],
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;

    const result = await generatePackageHandler(
      { projectDir, name: "cataloged", install: false },
      { silent: true },
    );

    expect(result?.success).toBe(true);

    const pkg: { devDependencies?: Record<string, string> } = JSON.parse(
      await readFile(join(projectDir, "packages", "cataloged", "package.json"), "utf8"),
    );
    expect(pkg.devDependencies?.typescript).toBe("catalog:");

    const root: { workspaces?: string[] | { catalog?: Record<string, string> } } = JSON.parse(
      await readFile(join(projectDir, "package.json"), "utf8"),
    );
    const catalog = Array.isArray(root.workspaces) ? undefined : root.workspaces?.catalog;
    expect(catalog?.typescript).toBeDefined();

    await assertWorkspaceGraph(projectDir);
  });

  it("plans a package without writing files in dry-run mode", async () => {
    const seeded = await runCreateTest({
      projectName: "generate-package-dry-run",
      addons: ["turborepo"],
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;

    const result = await generatePackageHandler(
      { projectDir, name: "shared", install: false, dryRun: true },
      { silent: true },
    );

    expect(result?.success).toBe(true);
    expect(result?.dryRun).toBe(true);
    expect(result?.plannedFileCount).toBeGreaterThanOrEqual(3);
    expect(existsSync(join(projectDir, "packages", "shared"))).toBe(false);
  });
});

describe("generateAppHandler", () => {
  it("requires a task runner and leaves packages unaffected on the same project", async () => {
    const seeded = await runCreateTest({ projectName: "generate-gate", addons: [] });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;

    // create() auto-selects a task runner for monorepos; strip it to exercise the gate.
    const btsPath = join(projectDir, "bts.jsonc");
    const btsContent = await readFile(btsPath, "utf8");
    await writeFile(btsPath, btsContent.replace(/"addons":\s*\[[^\]]*\]/, '"addons": ["none"]'));

    const appResult = await generateAppHandler(
      { projectDir, kind: "frontend", name: "admin", frontend: "next", install: false },
      { silent: true },
    );

    expect(appResult?.success).toBe(false);
    expect(appResult?.error).toContain("task runner");
    expect(appResult?.error).toContain("add turborepo");

    const packageResult = await generatePackageHandler(
      { projectDir, name: "ok", install: false },
      { silent: true },
    );

    expect(packageResult?.success).toBe(true);
  });

  it("scaffolds a second web app alongside the existing one", async () => {
    const seeded = await runCreateTest({
      projectName: "generate-app-happy",
      addons: ["turborepo"],
      frontend: ["tanstack-router"],
      backend: "hono",
      api: "trpc",
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;

    const result = await generateAppHandler(
      { projectDir, kind: "frontend", name: "admin", frontend: "next", install: false },
      { silent: true },
    );

    expect(result?.success).toBe(true);
    expect(result?.kind).toBe("app");
    expect(result?.appKind).toBe("frontend");
    expect(result?.name).toBe("admin");
    expect(
      readPackageName(await readFile(join(projectDir, "apps", "admin", "package.json"), "utf8")),
    ).toBe("admin");
    expect(existsSync(join(projectDir, "apps", "admin", "src"))).toBe(true);
    expect(existsSync(join(projectDir, "apps", "web"))).toBe(true);

    await assertWorkspaceGraph(projectDir);
  });

  it("declares varlock in a generated pnpm app so the isolated workspace resolves it", async () => {
    const seeded = await runCreateTest({
      projectName: "generate-app-varlock-pnpm",
      packageManager: "pnpm",
      addons: ["turborepo"],
      frontend: ["tanstack-router"],
      backend: "hono",
      api: "trpc",
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;

    const result = await generateAppHandler(
      { projectDir, kind: "frontend", name: "admin", frontend: "next", install: false },
      { silent: true },
    );

    expect(result?.success).toBe(true);

    const app: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    } = JSON.parse(await readFile(join(projectDir, "apps", "admin", "package.json"), "utf8"));
    expect(app.dependencies?.varlock ?? app.devDependencies?.varlock).toBeDefined();
    expect(app.dependencies?.["@varlock/nextjs-integration"]).toBeDefined();

    await assertWorkspaceGraph(projectDir);
  });

  it("wires the new app into the root env codegen scripts without dropping existing paths", async () => {
    const seeded = await runCreateTest({
      projectName: "generate-app-env-wiring",
      addons: ["turborepo"],
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;
    const rootPackagePath = join(projectDir, "package.json");
    const rootBefore: { scripts?: Record<string, string> } = JSON.parse(
      await readFile(rootPackagePath, "utf8"),
    );
    expect(rootBefore.scripts?.postinstall).toContain("varlock codegen --path ./apps/server/");

    const result = await generateAppHandler(
      { projectDir, kind: "frontend", name: "admin", frontend: "next", install: false },
      { silent: true },
    );

    expect(result?.success).toBe(true);
    expect(result?.warnings ?? []).toEqual([]);

    const root: { scripts?: Record<string, string> } = JSON.parse(
      await readFile(rootPackagePath, "utf8"),
    );
    const postinstall = root.scripts?.postinstall ?? "";
    const envGenerate = root.scripts?.["env:generate"] ?? "";
    expect(postinstall).toContain("varlock codegen --path ./apps/admin/");
    expect(postinstall).toContain("varlock codegen --path ./apps/server/");
    expect(envGenerate).toContain("varlock codegen --path ./apps/admin/");
    expect(envGenerate).toContain("varlock codegen --path ./apps/server/");
    expect(postinstall.split("varlock codegen --path ./apps/admin/")).toHaveLength(2);

    const app: { scripts?: Record<string, string> } = JSON.parse(
      await readFile(join(projectDir, "apps", "admin", "package.json"), "utf8"),
    );
    expect(app.scripts?.["env:generate"]).toBe("varlock codegen");
  });

  it("rejects a duplicate app name without touching existing artifacts or the root manifest", async () => {
    const seeded = await runCreateTest({
      projectName: "generate-app-duplicate",
      addons: ["turborepo"],
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;
    const rootPackagePath = join(projectDir, "package.json");

    const first = await generateAppHandler(
      { projectDir, kind: "frontend", name: "extra", frontend: "next", install: false },
      { silent: true },
    );
    expect(first?.success).toBe(true);
    const rootBefore = await readFile(rootPackagePath, "utf8");
    const firstArtifact = join(projectDir, "apps", "extra", "package.json");
    const artifactBefore = await readFile(firstArtifact, "utf8");

    const second = await generateAppHandler(
      { projectDir, kind: "frontend", name: "extra", frontend: "next", install: false },
      { silent: true },
    );

    expect(second?.success).toBe(false);
    expect(second?.error).toContain("already exists");
    expect(await readFile(firstArtifact, "utf8")).toBe(artifactBefore);
    expect(await readFile(rootPackagePath, "utf8")).toBe(rootBefore);
  });
});
