import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Frontend, I18nLibrary, ProjectConfig } from "@better-t-stack/types";

import {
  planWorkspaceApp,
  type PlanWorkspaceAppResult,
} from "../../../packages/template-generator/src/generators/workspace-app";
import { EMBEDDED_TEMPLATES } from "../../../packages/template-generator/src/templates.generated";
import { generateAppHandler } from "../src/helpers/core/generate-handler";
import { oracleCompatibility, type OracleSurface } from "./oracles/i18n";
import { expectSuccess, runCreateTest } from "./test-utils";

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackage(files: Map<string, string>, path: string): PackageJson {
  const content = files.get(path);
  if (content === undefined) throw new Error(`Missing planned file: ${path}`);
  return JSON.parse(content) as PackageJson;
}

function readPackageName(content: string): string {
  const parsed: { name?: string } = JSON.parse(content);
  return parsed.name ?? "";
}

type OracleFrontend = Extract<Frontend, OracleSurface>;

function requireReason(library: I18nLibrary, frontend: OracleFrontend): string {
  const reason = oracleCompatibility(library, [frontend]).reason;
  if (reason === undefined) {
    throw new Error(`oracle fixture must reject ${library} on ${frontend}`);
  }
  return reason;
}

function projectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "acme",
    projectDir: "/virtual/acme",
    relativePath: ".",
    database: "none",
    orm: "none",
    backend: "none",
    runtime: "none",
    frontend: [],
    addons: ["turborepo"],
    examples: [],
    auth: "none",
    payments: "none",
    emailRenderer: "none",
    emailDeploy: "none",
    i18n: "none",
    git: false,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "none",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

function i18nProjectConfig(library: I18nLibrary): ProjectConfig {
  return projectConfig({
    i18n: library,
    i18nOptions: { sourceLocale: "en", locales: ["en", "fr"], translateSkill: false },
  });
}

function existingProjectFiles(): Map<string, string> {
  return new Map([
    ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
    ["packages/i18n/package.json", JSON.stringify({ name: "@acme/i18n" })],
    [
      "package.json",
      JSON.stringify({ name: "acme", workspaces: { packages: ["apps/*", "packages/*"] } }),
    ],
  ]);
}

function planFrontend(config: ProjectConfig, frontend: Frontend): PlanWorkspaceAppResult {
  return planWorkspaceApp({
    config,
    kind: "frontend",
    name: "admin",
    frontend,
    existingFiles: existingProjectFiles(),
    templates: EMBEDDED_TEMPLATES,
  });
}

describe("planWorkspaceApp: i18n inheritance", () => {
  it("adds the project's i18n surface glue and library deps to a new frontend app", () => {
    const result = planFrontend(i18nProjectConfig("lingui"), "next");
    const keys = [...result.files.keys()];

    expect(keys.some((key) => key.startsWith("apps/admin/src/components/i18n-"))).toBe(true);
    const pkg = readPackage(result.files, "apps/admin/package.json");
    expect(pkg.dependencies?.["@acme/i18n"]).toBe("workspace:*");
    expect(pkg.dependencies?.["@lingui/react"]).toBeDefined();
  });

  it("wires the server locale middleware into a new backend app", () => {
    const result = planWorkspaceApp({
      config: projectConfig({
        i18n: "lingui",
        i18nOptions: { sourceLocale: "en", locales: ["en", "fr"], translateSkill: false },
        backend: "hono",
        runtime: "bun",
        api: "trpc",
      }),
      kind: "backend",
      name: "api2",
      backend: "hono",
      existingFiles: existingProjectFiles(),
      templates: EMBEDDED_TEMPLATES,
    });

    expect(result.files.get("apps/api2/src/middleware/locale.ts")).toContain("@acme/i18n");
    expect(readPackage(result.files, "apps/api2/package.json").dependencies?.["@acme/i18n"]).toBe(
      "workspace:*",
    );
  });

  it("leaves generation unchanged when the project has no i18n", () => {
    const result = planFrontend(projectConfig(), "next");
    const keys = [...result.files.keys()];

    expect(keys.some((key) => key.includes("i18n"))).toBe(false);
    expect(
      readPackage(result.files, "apps/admin/package.json").dependencies?.["@acme/i18n"],
    ).toBeUndefined();
  });

  it("surfaces the library's partial-support warning for the new app", () => {
    const expected = oracleCompatibility("lingui", ["astro"]);

    const result = planFrontend(i18nProjectConfig("lingui"), "astro");
    expect(result.warnings).toEqual(expect.arrayContaining(expected.warnings));
  });

  const rejections = [
    { library: "lingui", frontend: "svelte" },
    { library: "wuchale", frontend: "nuxt" },
  ] as const satisfies readonly { library: I18nLibrary; frontend: OracleFrontend }[];

  for (const { library, frontend } of rejections) {
    it(`rejects a ${frontend} app when the project uses ${library}`, () => {
      expect(() => planFrontend(i18nProjectConfig(library), frontend)).toThrow(
        requireReason(library, frontend),
      );
    });
  }
});

describe("generateAppHandler: i18n inheritance", () => {
  it("rejects an unsupported app and inherits i18n for a supported one", async () => {
    const seeded = await runCreateTest({
      projectName: "gen-app-i18n",
      frontend: ["tanstack-router"],
      i18n: "lingui",
      addons: ["turborepo"],
    });
    expectSuccess(seeded);
    const projectDir = seeded.projectDir;

    const rejected = await generateAppHandler(
      { projectDir, kind: "frontend", name: "web-svelte", frontend: "svelte", install: false },
      { silent: true },
    );
    expect(rejected?.success).toBe(false);
    expect(rejected?.error).toBe(requireReason("lingui", "svelte"));
    expect(existsSync(join(projectDir, "apps", "web-svelte"))).toBe(false);

    const generated = await generateAppHandler(
      { projectDir, kind: "frontend", name: "admin", frontend: "next", install: false },
      { silent: true },
    );
    expect(generated?.success).toBe(true);
    expect(
      existsSync(join(projectDir, "apps", "admin", "src", "components", "i18n-provider.tsx")),
    ).toBe(true);

    const configName = readPackageName(
      await readFile(join(projectDir, "packages", "config", "package.json"), "utf8"),
    );
    if (!configName.endsWith("/config")) {
      throw new Error(`Unexpected packages/config name: ${configName}`);
    }
    const scope = configName.slice(0, -"/config".length);
    const pkg: PackageJson = JSON.parse(
      await readFile(join(projectDir, "apps", "admin", "package.json"), "utf8"),
    );
    expect(pkg.dependencies?.[`${scope}/i18n`]).toBe("workspace:*");
    expect(pkg.dependencies?.["@lingui/react"]).toBeDefined();
  });
});
