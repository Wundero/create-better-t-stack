import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expectSuccess, runTRPCTest } from "./test-utils";

describe("i18n Option", () => {
  it("should generate packages/i18n when lingui is selected", async () => {
    const result = await runTRPCTest({
      projectName: "i18n-lingui",
      addons: ["none"],
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "better-auth",
      api: "trpc",
      examples: ["none"],
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
      email: "none",
      emailProvider: "none",
      i18n: "lingui",
      install: false,
    });

    expectSuccess(result);
    expect(result.projectDir).toBeDefined();

    const i18nPackageJson = join(result.projectDir!, "packages", "i18n", "package.json");
    const i18nSrcIndex = join(result.projectDir!, "packages", "i18n", "src", "index.ts");
    const i18nLocalesEn = join(result.projectDir!, "packages", "i18n", "src", "locales", "en.ts");

    expect(existsSync(i18nPackageJson)).toBe(true);
    expect(existsSync(i18nSrcIndex)).toBe(true);
    expect(existsSync(i18nLocalesEn)).toBe(true);

    const pkgContent = readFileSync(i18nPackageJson, "utf-8");
    expect(pkgContent).toContain("@lingui");

    const indexContent = readFileSync(i18nSrcIndex, "utf-8");
    expect(indexContent).toContain("setupI18n");
    expect(indexContent).toContain("@lingui");
  });

  it("should not generate packages/i18n when i18n is none", async () => {
    const result = await runTRPCTest({
      projectName: "i18n-none",
      addons: ["none"],
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "none",
      api: "trpc",
      examples: ["none"],
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
      email: "none",
      emailProvider: "none",
      i18n: "none",
      install: false,
    });

    expectSuccess(result);
    expect(result.projectDir).toBeDefined();

    const i18nPackageJson = join(result.projectDir!, "packages", "i18n", "package.json");
    expect(existsSync(i18nPackageJson)).toBe(false);
  });
});
