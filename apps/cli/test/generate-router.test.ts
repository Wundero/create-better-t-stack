import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { generateApp, generatePackage } from "../src/index";
import { expectSuccess, runCreateTest } from "./test-utils";

function readPackageName(content: string): string {
  const parsed: { name?: string } = JSON.parse(content);
  return parsed.name ?? "";
}

describe("generatePackage()", () => {
  it("scaffolds a workspace package inside a task-runner project", async () => {
    const seeded = await runCreateTest({ projectName: "gen-router-pkg", addons: ["turborepo"] });
    expectSuccess(seeded);

    const result = await generatePackage({
      projectDir: seeded.projectDir,
      name: "shared",
      install: false,
    });

    expect(result.success).toBe(true);
    expect(result.kind).toBe("package");
    expect(result.name).toBe("shared");
    expect(existsSync(join(seeded.projectDir, "packages", "shared", "src", "index.ts"))).toBe(true);
  });

  it("returns a validation failure for an invalid package name", async () => {
    const result = await generatePackage({ name: "@bad/name" });

    expect(result.success).toBe(false);
    expect(result.kind).toBe("package");
    expect(result.projectDir).toBe("");
    expect(result.error).toContain("Invalid generate package input");
    expect(result.error).toContain("name");
  });
});

describe("generateApp()", () => {
  it("scaffolds a second web app alongside the existing one", async () => {
    const seeded = await runCreateTest({
      projectName: "gen-router-app",
      addons: ["turborepo"],
      frontend: ["tanstack-router"],
      backend: "hono",
      api: "trpc",
    });
    expectSuccess(seeded);

    const result = await generateApp({
      projectDir: seeded.projectDir,
      kind: "frontend",
      name: "admin",
      frontend: "next",
      install: false,
    });

    expect(result.success).toBe(true);
    expect(result.kind).toBe("app");
    expect(result.appKind).toBe("frontend");
    expect(result.name).toBe("admin");
    expect(
      readPackageName(
        await readFile(join(seeded.projectDir, "apps", "admin", "package.json"), "utf8"),
      ),
    ).toBe("admin");
  });

  it("fails when the project has no task runner", async () => {
    const seeded = await runCreateTest({ projectName: "gen-router-gate", addons: ["none"] });
    expectSuccess(seeded);

    const result = await generateApp({
      projectDir: seeded.projectDir,
      kind: "frontend",
      name: "admin",
      frontend: "next",
      install: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("task runner");
  });
});
