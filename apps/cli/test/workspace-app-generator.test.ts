import { describe, expect, it } from "bun:test";

import type { ProjectConfig } from "@better-t-stack/types";

import {
  planWorkspaceApp,
  type PlanWorkspaceAppInput,
} from "../../../packages/template-generator/src/generators/workspace-app";
import { EMBEDDED_TEMPLATES } from "../../../packages/template-generator/src/templates.generated";

const baseConfig: ProjectConfig = {
  projectName: "acme",
  projectDir: "/virtual/p",
  relativePath: ".",
  database: "postgres",
  orm: "drizzle",
  backend: "hono",
  runtime: "bun",
  frontend: ["tanstack-router"],
  addons: ["turborepo"],
  examples: [],
  auth: "none",
  payments: "none",
  git: false,
  packageManager: "bun",
  install: false,
  dbSetup: "none",
  api: "trpc",
  webDeploy: "none",
  serverDeploy: "none",
};

const SERVER_ENV_COMMAND = "varlock codegen --path ./apps/server/";

/** Existing monorepo files the planner must see, but never return. */
function existingProjectFiles(): Map<string, string> {
  return new Map([
    ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
    ["packages/api/package.json", JSON.stringify({ name: "@acme/api" })],
    ["packages/ui/package.json", JSON.stringify({ name: "@acme/ui" })],
    [
      "package.json",
      JSON.stringify({
        name: "acme",
        scripts: {
          "env:generate": SERVER_ENV_COMMAND,
          postinstall: SERVER_ENV_COMMAND,
        },
        devDependencies: { varlock: "1.18.0" },
      }),
    ],
  ]);
}

type PackageJson = {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackage(files: Map<string, string>, path: string): PackageJson {
  const content = files.get(path);
  if (content === undefined) throw new Error(`Missing planned file: ${path}`);
  return JSON.parse(content) as PackageJson;
}

function readRootPackage(result: { rootFiles: Map<string, string> }): PackageJson {
  return readPackage(result.rootFiles, "package.json");
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function allKeysStartWith(files: Map<string, string>, prefix: string): boolean {
  return [...files.keys()].every((key) => key.startsWith(prefix));
}

function hasKeyStartingWith(files: Map<string, string>, prefix: string): boolean {
  return [...files.keys()].some((key) => key.startsWith(prefix));
}

const sharedInput = {
  config: baseConfig,
  templates: EMBEDDED_TEMPLATES,
} satisfies Omit<PlanWorkspaceAppInput, "kind" | "name" | "existingFiles" | "frontend" | "backend">;

describe("planWorkspaceApp", () => {
  describe("frontend kind", () => {
    const plan = () =>
      planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles: existingProjectFiles(),
      });

    it("emits every file under apps/<name> and rewrites the package name", () => {
      const result = plan();

      expect(allKeysStartWith(result.files, "apps/admin/")).toBe(true);
      expect(readPackage(result.files, "apps/admin/package.json").name).toBe("admin");
      expect(result.warnings).toEqual([]);
    });

    it("links preloaded workspace packages as dependencies", () => {
      const pkg = readPackage(plan().files, "apps/admin/package.json");

      expect(pkg.dependencies?.["@acme/api"]).toBe("workspace:*");
      expect(pkg.dependencies?.["@acme/ui"]).toBe("workspace:*");
    });

    it("contains generated app source", () => {
      expect(hasKeyStartingWith(plan().files, "apps/admin/src/")).toBe(true);
    });

    it("never leaks the canonical subtree or other app dirs", () => {
      const keys = [...plan().files.keys()];

      expect(keys.some((key) => key.startsWith("apps/web/"))).toBe(false);
      expect(keys.some((key) => key.startsWith("apps/server/"))).toBe(false);
      expect(keys.some((key) => key.startsWith("apps/native/"))).toBe(false);
    });
  });

  describe("mobile kind", () => {
    const plan = () =>
      planWorkspaceApp({
        ...sharedInput,
        kind: "mobile",
        name: "mobile",
        frontend: "native-bare",
        existingFiles: existingProjectFiles(),
      });

    it("extracts the native canonical subtree under apps/<name>", () => {
      const result = plan();

      expect(allKeysStartWith(result.files, "apps/mobile/")).toBe(true);
      expect(readPackage(result.files, "apps/mobile/package.json").name).toBe("mobile");
      expect(result.warnings).toEqual([]);
    });

    it("never leaks apps/native or apps/web", () => {
      const keys = [...plan().files.keys()];

      expect(keys.some((key) => key.startsWith("apps/native/"))).toBe(false);
      expect(keys.some((key) => key.startsWith("apps/web/"))).toBe(false);
    });
  });

  describe("backend kind", () => {
    const plan = () =>
      planWorkspaceApp({
        ...sharedInput,
        kind: "backend",
        name: "worker",
        backend: "hono",
        existingFiles: existingProjectFiles(),
      });

    it("extracts the server canonical subtree under apps/<name>", () => {
      const result = plan();

      expect(allKeysStartWith(result.files, "apps/worker/")).toBe(true);
      expect(readPackage(result.files, "apps/worker/package.json").name).toBe("worker");
      expect(result.files.has("apps/worker/src/index.ts")).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("links the preloaded api workspace package", () => {
      const pkg = readPackage(plan().files, "apps/worker/package.json");

      expect(pkg.dependencies?.["@acme/api"]).toBe("workspace:*");
    });

    it("never leaks the canonical apps/server dir", () => {
      expect(hasKeyStartingWith(plan().files, "apps/server/")).toBe(false);
    });
  });

  describe("catalog reuse", () => {
    it("rewrites generated shared dependencies to the existing catalog", () => {
      const existingFiles = new Map([
        [
          "package.json",
          JSON.stringify({
            name: "acme",
            workspaces: { packages: ["apps/*", "packages/*"], catalog: { next: "^16.3.4" } },
          }),
        ],
        ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
        ["packages/api/package.json", JSON.stringify({ name: "@acme/api" })],
        ["packages/ui/package.json", JSON.stringify({ name: "@acme/ui" })],
      ]);

      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles,
      });

      expect(readPackage(result.files, "apps/admin/package.json").dependencies?.next).toBe(
        "catalog:",
      );
      expect(allKeysStartWith(result.files, "apps/admin/")).toBe(true);
    });

    it("persists only catalog changes and never the handler root mutations", () => {
      const originalScripts = {
        "env:generate": "varlock codegen --path ./apps/server/",
        postinstall: "echo hi && varlock codegen --path ./apps/server/",
      };
      const existingFiles = new Map([
        [
          "package.json",
          JSON.stringify({
            name: "acme",
            scripts: originalScripts,
            devDependencies: { typescript: "^6.0.3", varlock: "1.18.0" },
            workspaces: { packages: ["apps/*", "packages/*"], catalog: {} },
          }),
        ],
        [
          "packages/config/package.json",
          JSON.stringify({ name: "@acme/config", dependencies: { next: "^16.3.4" } }),
        ],
        [
          "packages/api/package.json",
          JSON.stringify({ name: "@acme/api", dependencies: { next: "^16.3.4" } }),
        ],
      ]);

      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles,
      });

      expect(readPackage(result.files, "apps/admin/package.json").dependencies?.next).toBe(
        "catalog:",
      );

      // Incremental generation runs the full handlers, which mutate the root
      // package.json for a fresh scaffold (varlock scripts, workspace deps).
      // Restoring before the catalog run discards those mutations; the only
      // script change that persists is wiring the new app's env codegen path.
      const rootContent = result.rootFiles.get("package.json");
      expect(rootContent).toBeDefined();
      const root = JSON.parse(rootContent!) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        workspaces?: { catalog?: Record<string, string> };
      };

      expect(root.scripts).toEqual({
        "env:generate":
          "varlock codegen --path ./apps/server/ && varlock codegen --path ./apps/admin/",
        postinstall:
          "echo hi && varlock codegen --path ./apps/server/ && varlock codegen --path ./apps/admin/",
      });
      expect(Object.keys(root.devDependencies ?? {})).toEqual(["typescript", "varlock"]);
      expect(root.devDependencies?.typescript).toBe("catalog:");
      expect(root.devDependencies?.varlock).toBe("catalog:");
      expect(root.dependencies).toBeUndefined();
      expect(root.workspaces?.catalog?.next).toBe("^16.3.4");
    });
  });

  describe("varlock wiring", () => {
    function varlockProjectFiles(): Map<string, string> {
      return new Map([
        [
          "package.json",
          JSON.stringify({
            name: "acme",
            scripts: {
              "env:generate": SERVER_ENV_COMMAND,
              postinstall: `echo hi && ${SERVER_ENV_COMMAND}`,
            },
            devDependencies: { typescript: "^6.0.3" },
            workspaces: {
              packages: ["apps/*", "packages/*"],
              catalog: { varlock: "1.18.0" },
            },
          }),
        ],
        ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
        [
          "packages/api/package.json",
          JSON.stringify({ name: "@acme/api", dependencies: { next: "^16.3.4" } }),
        ],
      ]);
    }

    it("declares varlock and the framework integration for a generated frontend app", () => {
      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles: varlockProjectFiles(),
      });

      const pkg = readPackage(result.files, "apps/admin/package.json");

      expect(pkg.dependencies?.varlock ?? pkg.devDependencies?.varlock).toBe("catalog:");
      expect(pkg.dependencies?.["@varlock/nextjs-integration"]).toBeDefined();
    });

    it("declares varlock for a generated backend app", () => {
      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "backend",
        name: "worker",
        backend: "hono",
        existingFiles: varlockProjectFiles(),
      });

      const pkg = readPackage(result.files, "apps/worker/package.json");

      expect(pkg.dependencies?.varlock ?? pkg.devDependencies?.varlock).toBe("catalog:");
    });
  });

  describe("root env wiring", () => {
    function wiredProjectFiles(rootScripts: Record<string, string>): Map<string, string> {
      return new Map([
        [
          "package.json",
          JSON.stringify({
            name: "acme",
            scripts: rootScripts,
            devDependencies: { typescript: "^6.0.3", varlock: "1.18.0" },
            workspaces: { packages: ["apps/*", "packages/*"], catalog: {} },
          }),
        ],
        ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
        [
          "packages/api/package.json",
          JSON.stringify({ name: "@acme/api", dependencies: { next: "^16.3.4" } }),
        ],
      ]);
    }

    it("appends the new app's varlock codegen path to both root env scripts", () => {
      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles: wiredProjectFiles({
          "env:generate": SERVER_ENV_COMMAND,
          postinstall: `echo hi && ${SERVER_ENV_COMMAND}`,
        }),
      });

      expect(result.files.has("apps/admin/.env.schema")).toBe(true);
      expect(result.envGeneratePath).toBe("apps/admin");
      expect(result.warnings).toEqual([]);

      const root = readRootPackage(result);
      expect(root.scripts?.["env:generate"]).toBe(
        `${SERVER_ENV_COMMAND} && varlock codegen --path ./apps/admin/`,
      );
      expect(root.scripts?.postinstall).toBe(
        `echo hi && ${SERVER_ENV_COMMAND} && varlock codegen --path ./apps/admin/`,
      );
    });

    it("warns instead of wiring when the root has no env scripts", () => {
      const existingFiles = new Map([
        [
          "package.json",
          JSON.stringify({
            name: "acme",
            workspaces: { packages: ["apps/*", "packages/*"], catalog: {} },
          }),
        ],
        ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
        [
          "packages/api/package.json",
          JSON.stringify({ name: "@acme/api", dependencies: { next: "^16.3.4" } }),
        ],
      ]);

      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles,
      });

      expect(result.files.has("apps/admin/.env.schema")).toBe(true);
      expect(result.envGeneratePath).toBeUndefined();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("varlock codegen --path ./apps/admin/");
      expect(result.warnings[0]).toContain("bun run env:generate");
    });

    it("does not wire an unrelated postinstall when the root has no varlock dependency", () => {
      const existingFiles = new Map([
        [
          "package.json",
          JSON.stringify({
            name: "acme",
            scripts: { postinstall: "echo hi" },
            devDependencies: { typescript: "^6.0.3" },
            workspaces: { packages: ["apps/*", "packages/*"], catalog: {} },
          }),
        ],
        ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
      ]);

      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles,
      });

      expect(result.files.has("apps/admin/.env.schema")).toBe(true);
      expect(result.envGeneratePath).toBeUndefined();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("varlock codegen --path ./apps/admin/");

      const rootContent = result.rootFiles.get("package.json");
      if (rootContent !== undefined) {
        const root = JSON.parse(rootContent) as { scripts?: Record<string, string> };
        expect(root.scripts?.postinstall).toBe("echo hi");
        expect(root.scripts?.["env:generate"] ?? "").not.toContain("varlock");
      }
    });

    it("does not append the command twice when the root is already wired", () => {
      const adminCommand = "varlock codegen --path ./apps/admin/";
      const result = planWorkspaceApp({
        ...sharedInput,
        kind: "frontend",
        name: "admin",
        frontend: "next",
        existingFiles: wiredProjectFiles({
          "env:generate": `${SERVER_ENV_COMMAND} && ${adminCommand}`,
          postinstall: `echo hi && ${SERVER_ENV_COMMAND} && ${adminCommand}`,
        }),
      });

      expect(result.envGeneratePath).toBe("apps/admin");
      expect(result.warnings).toEqual([]);

      const root = readRootPackage(result);
      const envGenerate = root.scripts?.["env:generate"] ?? "";
      const postinstall = root.scripts?.postinstall ?? "";
      expect(envGenerate).toBe(`${SERVER_ENV_COMMAND} && ${adminCommand}`);
      expect(postinstall).toBe(`echo hi && ${SERVER_ENV_COMMAND} && ${adminCommand}`);
      expect(countOccurrences(envGenerate, adminCommand)).toBe(1);
      expect(countOccurrences(postinstall, adminCommand)).toBe(1);
    });
  });

  it("never returns preloaded existing files", () => {
    const result = planWorkspaceApp({
      ...sharedInput,
      kind: "frontend",
      name: "admin",
      frontend: "next",
      existingFiles: existingProjectFiles(),
    });

    expect(result.files.has("packages/api/package.json")).toBe(false);
    expect(result.files.has("package.json")).toBe(false);
  });

  it("plans a better-auth frontend app when the server app is absent", () => {
    const existingFiles = new Map([
      ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
      ["packages/db/package.json", JSON.stringify({ name: "@acme/db" })],
      ["packages/ui/package.json", JSON.stringify({ name: "@acme/ui" })],
      ["package.json", JSON.stringify({ name: "acme" })],
    ]);
    // The server app is deliberately not preloaded: the better-auth script
    // block must skip packages that are not part of this workspace plan.
    expect([...existingFiles.keys()].some((key) => key.startsWith("apps/"))).toBe(false);

    const config: ProjectConfig = {
      ...baseConfig,
      auth: "better-auth",
      backend: "hono",
      orm: "drizzle",
      runtime: "bun",
      serverDeploy: "none",
      webDeploy: "none",
    };

    const result = planWorkspaceApp({
      config,
      kind: "frontend",
      name: "admin-auth",
      frontend: "next",
      existingFiles,
      templates: EMBEDDED_TEMPLATES,
    });

    expect(readPackage(result.files, "apps/admin-auth/package.json").name).toBe("admin-auth");
  });
});
