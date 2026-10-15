/**
 * End-to-end coverage for the `generate` / `generate-json` CLI surface.
 *
 * Every scenario here spawns the BUILT artifact (`dist/cli.mjs`) with `node`
 * against a project seeded through the programmatic `create()` API. Assertions
 * check observable outcomes (exit code, files on disk, parsed JSON) instead of
 * log formatting, so they stay valid across prompt/UI changes.
 *
 * Run `bun run build:cli` before this file; `dist` is required.
 */

import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { execa } from "execa";
import fs from "fs-extra";

import { SMOKE_DIR } from "./setup";
import { expectSuccess, runCreateTest, type TestConfig } from "./test-utils";
import { assertWorkspaceGraph } from "./workspace-graph";

const cliDir = join(import.meta.dir, "..");
const cliEntry = "dist/cli.mjs";

async function seedProject(config: TestConfig) {
  const seeded = await runCreateTest(config);
  expectSuccess(seeded);
  // Projects must live under the auto-cleaned smoke directory for isolation.
  expect(seeded.projectDir.startsWith(SMOKE_DIR)).toBe(true);
  return seeded;
}

function runGenerateCli(args: string[]) {
  return execa("node", [cliEntry, ...args], {
    cwd: cliDir,
    timeout: 60_000,
    env: {
      ...process.env,
      BTS_TELEMETRY_DISABLED: "1",
      BTS_SKIP_EXTERNAL_COMMANDS: "1",
      BTS_TEST_MODE: "1",
    },
    reject: false,
  });
}

function combinedOutput(result: { stdout: string; stderr: string }): string {
  return `${result.stdout}\n${result.stderr}`;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function readPackageName(filePath: string): Promise<string> {
  return (await readJsonFile<{ name?: string }>(filePath)).name ?? "";
}

describe("generate package via built CLI", () => {
  it("S1: scaffolds a workspace package and derives the scope from packages/config", async () => {
    const seeded = await seedProject({ projectName: "e2e-gen-pkg", addons: ["turborepo"] });

    const { exitCode } = await runGenerateCli([
      "generate",
      "package",
      "--project-dir",
      seeded.projectDir,
      "--name",
      "shared",
    ]);
    expect(exitCode).toBe(0);

    const packageDir = join(seeded.projectDir, "packages", "shared");
    for (const relativePath of ["package.json", "tsconfig.json", "src/index.ts"]) {
      expect(await fs.pathExists(join(packageDir, relativePath))).toBe(true);
    }

    const configName = await readPackageName(
      join(seeded.projectDir, "packages", "config", "package.json"),
    );
    const scope = configName.slice(0, -"/config".length);
    expect(await readPackageName(join(packageDir, "package.json"))).toBe(`${scope}/shared`);

    await assertWorkspaceGraph(seeded.projectDir);
  });

  it("S1e: --env-validation wires varlock into the package and root postinstall", async () => {
    const seeded = await seedProject({ projectName: "e2e-gen-pkg-env", addons: ["turborepo"] });

    const packageDir = join(seeded.projectDir, "packages", "shared-env");
    const { exitCode } = await runGenerateCli([
      "generate",
      "package",
      "--project-dir",
      seeded.projectDir,
      "--name",
      "shared-env",
      "--env-validation",
    ]);
    expect(exitCode).toBe(0);

    const envSchema = await fs.readFile(join(packageDir, ".env.schema"), "utf8");
    expect(envSchema).toContain("# @generateTsTypes(path=./src/env.ts, exposeEnv=local)");

    const rootPackage = await readJsonFile<{ scripts?: Record<string, string> }>(
      join(seeded.projectDir, "package.json"),
    );
    expect(rootPackage.scripts?.postinstall ?? "").toContain(
      "varlock codegen --path ./packages/shared-env/",
    );

    // varlock generates src/env.ts at install time, never at scaffold time.
    expect(await fs.pathExists(join(packageDir, "src", "env.ts"))).toBe(false);
  });

  it("S5: --dry-run plans a package without writing files", async () => {
    const seeded = await seedProject({ projectName: "e2e-gen-dry", addons: ["turborepo"] });

    const { exitCode } = await runGenerateCli([
      "generate",
      "package",
      "--project-dir",
      seeded.projectDir,
      "--name",
      "ghost",
      "--dry-run",
    ]);
    expect(exitCode).toBe(0);
    expect(await fs.pathExists(join(seeded.projectDir, "packages", "ghost"))).toBe(false);
  });
});

describe("generate app via built CLI", () => {
  it("S2: scaffolds a second frontend app beside apps/web", async () => {
    const seeded = await seedProject({
      projectName: "e2e-gen-app",
      addons: ["turborepo"],
      frontend: ["tanstack-router"],
      backend: "hono",
      api: "trpc",
    });

    const { exitCode } = await runGenerateCli([
      "generate",
      "app",
      "--project-dir",
      seeded.projectDir,
      "--kind",
      "frontend",
      "--name",
      "admin",
      "--frontend",
      "next",
    ]);
    expect(exitCode).toBe(0);

    expect(await readPackageName(join(seeded.projectDir, "apps", "admin", "package.json"))).toBe(
      "admin",
    );
    expect(await fs.pathExists(join(seeded.projectDir, "apps", "web"))).toBe(true);

    await assertWorkspaceGraph(seeded.projectDir);
  });

  it("S3: rejects a duplicate app name with a non-zero exit and preserves the first app", async () => {
    const seeded = await seedProject({ projectName: "e2e-gen-dup", addons: ["turborepo"] });

    const args = [
      "generate",
      "app",
      "--project-dir",
      seeded.projectDir,
      "--kind",
      "frontend",
      "--name",
      "admin",
      "--frontend",
      "next",
    ];

    const first = await runGenerateCli(args);
    expect(first.exitCode).toBe(0);

    const appManifest = join(seeded.projectDir, "apps", "admin", "package.json");
    const manifestBefore = await fs.readFile(appManifest, "utf8");

    const second = await runGenerateCli(args);
    expect(second.exitCode).not.toBe(0);
    expect(combinedOutput(second)).toContain("already exists");

    expect(await fs.readFile(appManifest, "utf8")).toBe(manifestBefore);
    expect(await readPackageName(appManifest)).toBe("admin");
  });

  it("S4: blocks app generation without a task runner but still allows packages", async () => {
    const seeded = await seedProject({ projectName: "e2e-gen-gate", addons: ["none"] });

    const appResult = await runGenerateCli([
      "generate",
      "app",
      "--project-dir",
      seeded.projectDir,
      "--kind",
      "frontend",
      "--name",
      "admin",
      "--frontend",
      "next",
    ]);
    expect(appResult.exitCode).not.toBe(0);
    expect(combinedOutput(appResult)).toContain("task runner");

    const packageResult = await runGenerateCli([
      "generate",
      "package",
      "--project-dir",
      seeded.projectDir,
      "--name",
      "ok",
    ]);
    expect(packageResult.exitCode).toBe(0);
    expect(await fs.pathExists(join(seeded.projectDir, "packages", "ok", "package.json"))).toBe(
      true,
    );
    expect(await fs.pathExists(join(seeded.projectDir, "apps", "admin"))).toBe(false);
  });
});

describe("generate-json via built CLI", () => {
  it("S6: emits a JSON result and scaffolds a package", async () => {
    const seeded = await seedProject({ projectName: "e2e-gen-json", addons: ["turborepo"] });

    const { exitCode, stdout } = await runGenerateCli([
      "generate-json",
      "--json",
      JSON.stringify({ target: "package", projectDir: seeded.projectDir, name: "via-json" }),
    ]);
    expect(exitCode).toBe(0);

    const payload: unknown = JSON.parse(stdout);
    expect(payload).toMatchObject({ success: true, kind: "package", name: "via-json" });
    expect(
      await fs.pathExists(join(seeded.projectDir, "packages", "via-json", "package.json")),
    ).toBe(true);
  });

  it("S6b: emits a JSON result and scaffolds an app", async () => {
    const seeded = await seedProject({ projectName: "e2e-gen-json-app", addons: ["turborepo"] });

    const { exitCode, stdout } = await runGenerateCli([
      "generate-json",
      "--json",
      JSON.stringify({
        target: "app",
        projectDir: seeded.projectDir,
        kind: "frontend",
        name: "json-admin",
        frontend: "next",
      }),
    ]);
    expect(exitCode).toBe(0);

    const payload: unknown = JSON.parse(stdout);
    expect(payload).toMatchObject({ success: true, kind: "app", name: "json-admin" });
    expect(await fs.pathExists(join(seeded.projectDir, "apps", "json-admin", "package.json"))).toBe(
      true,
    );
  });
});
