import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "jsonc-parser";
import { FailedToExitError } from "trpc-cli";

import { add, createBtsCli } from "../src/index";
import type { I18nOptions } from "../src/types";
import { expectSuccess, runCreateTest } from "./test-utils";

function linguiOptions(overrides: Partial<I18nOptions> = {}): I18nOptions {
  return {
    sourceLocale: "en",
    locales: ["en", "fr"],
    translateSkill: false,
    ...overrides,
  };
}

async function readBtsConfig(projectDir: string) {
  return parse(await readFile(join(projectDir, "bts.jsonc"), "utf8"), [], {
    allowTrailingComma: true,
  }) as { i18n?: string; i18nOptions?: I18nOptions };
}

async function readFileOrUndefined(projectDir: string, relativePath: string) {
  const fullPath = join(projectDir, relativePath);
  return existsSync(fullPath) ? readFile(fullPath, "utf8") : undefined;
}

describe("add --i18n retrofit", () => {
  it("installs i18n into a pristine project and records it in bts.jsonc", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-pristine",
      frontend: ["next"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
    });
    expectSuccess(created);

    const result = await add({
      projectDir: created.projectDir,
      i18n: "lingui",
      i18nOptions: linguiOptions(),
      install: false,
    });

    expect(result?.success).toBe(true);

    const btsConfig = await readBtsConfig(created.projectDir);
    expect(btsConfig.i18n).toBe("lingui");
    expect(btsConfig.i18nOptions?.locales).toEqual(["en", "fr"]);

    expect(existsSync(join(created.projectDir, "packages/i18n/package.json"))).toBe(true);
    expect(existsSync(join(created.projectDir, "packages/i18n/locales/en/messages.po"))).toBe(true);
    expect(existsSync(join(created.projectDir, "apps/web/src/components/i18n-provider.tsx"))).toBe(
      true,
    );

    const nextConfig = await readFileOrUndefined(created.projectDir, "apps/web/next.config.ts");
    expect(nextConfig).toContain("@lingui");

    const packageJson = await readFile(join(created.projectDir, "apps/web/package.json"), "utf8");
    expect(packageJson).toContain("@lingui/react");

    const rootPackageJson = await readFile(join(created.projectDir, "package.json"), "utf8");
    expect(rootPackageJson).toContain("i18n:extract");
    expect(rootPackageJson).toContain("i18n:compile");
  });

  it("keeps a user-modified root file and reports a manual step", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-modified-root",
      frontend: ["next"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
    });
    expectSuccess(created);

    const providersPath = join(created.projectDir, "apps/web/src/components/providers.tsx");
    const original = await readFile(providersPath, "utf8");
    const modified = original.replace(/<ThemeProvider/g, "<CustomProvider");
    expect(modified).not.toBe(original);
    await writeFile(providersPath, modified, "utf8");

    const result = await add({
      projectDir: created.projectDir,
      i18n: "lingui",
      i18nOptions: linguiOptions(),
      install: false,
    });

    expect(result?.success).toBe(true);
    expect(await readFile(providersPath, "utf8")).toBe(modified);

    const setupDoc = await readFileOrUndefined(created.projectDir, "I18N_SETUP.md");
    expect(setupDoc).toBeDefined();
    expect(setupDoc).toContain("apps/web/src/components/providers.tsx");
  });

  it("plans no changes on a second run (idempotent)", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-idempotent",
      frontend: ["next"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
    });
    expectSuccess(created);

    const first = await add({
      projectDir: created.projectDir,
      i18n: "lingui",
      i18nOptions: linguiOptions(),
      install: false,
    });
    expect(first?.success).toBe(true);

    const nextConfigBefore = await readFileOrUndefined(
      created.projectDir,
      "apps/web/next.config.ts",
    );

    const second = await add({
      projectDir: created.projectDir,
      i18n: "lingui",
      i18nOptions: linguiOptions(),
      install: false,
      dryRun: true,
    });

    expect(second?.success).toBe(true);
    expect(second?.dryRun).toBe(true);
    expect(second?.plannedFileCount).toBe(0);
    expect(await readFileOrUndefined(created.projectDir, "apps/web/next.config.ts")).toBe(
      nextConfigBefore,
    );
  });

  it("adds locales to a project that already has i18n", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-locales",
      frontend: ["next"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
      i18n: "lingui",
      i18nOptions: linguiOptions({ locales: ["en", "es"] }),
    });
    expectSuccess(created);

    expect(existsSync(join(created.projectDir, "packages/i18n/locales/fr/messages.po"))).toBe(
      false,
    );

    const result = await add({
      projectDir: created.projectDir,
      i18nOptions: linguiOptions({ locales: ["en", "es", "fr"] }),
      install: false,
    });

    expect(result?.success).toBe(true);
    expect(existsSync(join(created.projectDir, "packages/i18n/locales/fr/messages.po"))).toBe(true);

    const configTs = await readFile(
      join(created.projectDir, "packages/i18n/src/config.ts"),
      "utf8",
    );
    expect(configTs).toContain('"fr"');
    expect(configTs).not.toContain('"de"');

    const btsConfig = await readBtsConfig(created.projectDir);
    expect(btsConfig.i18nOptions?.locales).toEqual(["en", "es", "fr"]);
  });

  it("rejects switching to a different i18n library", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-switch",
      frontend: ["next"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
      i18n: "lingui",
      i18nOptions: linguiOptions(),
    });
    expectSuccess(created);

    const result = await add({
      projectDir: created.projectDir,
      i18n: "i18next",
      install: false,
    });

    expect(result?.success).toBe(false);
    expect(result?.error).toContain("Switching");
    expect((await readBtsConfig(created.projectDir)).i18n).toBe("lingui");
  });

  it("prints a dry-run plan without writing files", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-dry-run",
      frontend: ["next"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
    });
    expectSuccess(created);

    const result = await add({
      projectDir: created.projectDir,
      i18n: "paraglide",
      i18nOptions: linguiOptions(),
      install: false,
      dryRun: true,
    });

    expect(result?.success).toBe(true);
    expect(result?.dryRun).toBe(true);
    expect(result?.plannedFileCount).toBeGreaterThan(0);
    expect(existsSync(join(created.projectDir, "packages/i18n"))).toBe(false);
    expect((await readBtsConfig(created.projectDir)).i18n).toBe("none");
  });

  it("installs a second library (paraglide) into a Vite-based project", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-paraglide",
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
    });
    expectSuccess(created);

    const result = await add({
      projectDir: created.projectDir,
      i18n: "paraglide",
      i18nOptions: linguiOptions({ locales: ["en", "fr"] }),
      install: false,
    });

    expect(result?.success).toBe(true);
    expect((await readBtsConfig(created.projectDir)).i18n).toBe("paraglide");
    expect(existsSync(join(created.projectDir, "packages/i18n/project.inlang/settings.json"))).toBe(
      true,
    );

    const viteConfig = await readFileOrUndefined(created.projectDir, "apps/web/vite.config.ts");
    expect(viteConfig).toContain("paraglide");
  });

  it("folds the flat --i18n flags on the add command", async () => {
    const created = await runCreateTest({
      projectName: "add-i18n-cli-flags",
      frontend: ["next"],
      backend: "hono",
      runtime: "bun",
      api: "trpc",
      database: "sqlite",
      orm: "drizzle",
      addons: ["none"],
    });
    expectSuccess(created);

    const outcome = await createBtsCli()
      .run({
        argv: [
          "add",
          "--project-dir",
          created.projectDir,
          "--i18n",
          "lingui",
          "--i18n-locales",
          "en,fr",
          "--disable-analytics",
        ],
        logger: { info: () => {}, error: () => {} },
        process: { exit: () => 0 as never },
      })
      .catch((error) => error);

    if (outcome instanceof FailedToExitError) {
      expect(outcome.exitCode).toBe(0);
    }

    const btsConfig = await readBtsConfig(created.projectDir);
    expect(btsConfig.i18n).toBe("lingui");
    expect(btsConfig.i18nOptions?.locales).toEqual(["en", "fr"]);
    expect(btsConfig.i18nOptions?.sourceLocale).toBe("en");
    expect(existsSync(join(created.projectDir, "packages/i18n/package.json"))).toBe(true);
  });
});
