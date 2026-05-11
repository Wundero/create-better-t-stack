import { describe, expect, it } from "bun:test";
import path from "node:path";

import fs from "fs-extra";

import { create, createVirtual } from "../src/index";
import { collectFiles, SMOKE_DIR } from "./setup";

function parseJson<T>(content: string): T {
  return JSON.parse(content) as T;
}

describe("Package scope", () => {
  it("defaults generated workspace packages to the project name scope", async () => {
    const result = await createVirtual({
      projectName: "default-scope-app",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "better-auth",
      api: "trpc",
      frontend: ["tanstack-router"],
      addons: ["turborepo"],
      examples: ["todo"],
      packageManager: "bun",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const files = collectFiles(result.value.root, "default-scope-app");
    const apiPackage = parseJson<{ name: string }>(files.get("packages/api/package.json") ?? "{}");
    const router = files.get("apps/web/src/utils/trpc.ts") ?? "";

    expect(apiPackage.name).toBe("@default-scope-app/api");
    expect(router).toContain('"@default-scope-app/api/routers/index"');
  });

  it("uses a custom package scope for generated package names, imports, and workspace deps", async () => {
    const result = await createVirtual({
      projectName: "custom-scope-app",
      packageScope: "@wundero",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "better-auth",
      api: "trpc",
      frontend: ["tanstack-router"],
      addons: ["turborepo"],
      examples: ["todo"],
      packageManager: "bun",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const files = collectFiles(result.value.root, "custom-scope-app");
    const apiPackage = parseJson<{ name: string }>(files.get("packages/api/package.json") ?? "{}");
    const webPackage = parseJson<{ dependencies?: Record<string, string> }>(
      files.get("apps/web/package.json") ?? "{}",
    );
    const router = files.get("apps/web/src/utils/trpc.ts") ?? "";
    const allText = Array.from(files.values()).join("\n");

    expect(apiPackage.name).toBe("@wundero/api");
    expect(webPackage.dependencies).toHaveProperty("@wundero/api");
    expect(webPackage.dependencies).toHaveProperty("@wundero/ui");
    expect(router).toContain('"@wundero/api/routers/index"');
    expect(allText).not.toContain("@custom-scope-app/");
  });

  it("includes non-default package scope in reproducible commands and bts config", async () => {
    const projectPath = path.join(SMOKE_DIR, "package-scope-config");
    await fs.remove(projectPath);

    const result = await create(projectPath, {
      packageScope: "@wundero",
      install: false,
      git: false,
      disableAnalytics: true,
      directoryConflict: "overwrite",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value.projectConfig.packageScope).toBe("@wundero");
    expect(result.value.reproducibleCommand).toContain("--package-scope @wundero");

    const btsConfig = await fs.readFile(path.join(projectPath, "bts.jsonc"), "utf-8");
    expect(btsConfig).toContain('"packageScope": "@wundero"');
  });
});
