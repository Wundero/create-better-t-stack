import { describe, expect, it } from "bun:test";

import {
  planWorkspacePackage,
  type PlanWorkspacePackageInput,
} from "../../../packages/template-generator/src/generators/workspace-package";
import { dependencyVersionMap } from "../../../packages/template-generator/src/utils/add-deps";

const baseInput = {
  packageName: "shared",
  packageScope: "@acme",
  packageManager: "bun",
  typescriptVersion: "^6.0.3",
} satisfies PlanWorkspacePackageInput;

const packageJsonPath = "packages/shared/package.json";
const tsconfigPath = "packages/shared/tsconfig.json";
const indexPath = "packages/shared/src/index.ts";
const envSchemaPath = "packages/shared/.env.schema";
const gitignorePath = "packages/shared/.gitignore";

function readFile(result: ReturnType<typeof planWorkspacePackage>, path: string): string {
  const content = result.files.get(path);
  if (content === undefined) throw new Error(`Missing planned file: ${path}`);
  return content;
}

function readRootFile(result: ReturnType<typeof planWorkspacePackage>, path: string): string {
  const content = result.rootFiles.get(path);
  if (content === undefined) throw new Error(`Missing planned root file: ${path}`);
  return content;
}

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: { catalog?: Record<string, string> };
};

describe("planWorkspacePackage", () => {
  describe("base files", () => {
    it("emits exactly the legacy package.json, tsconfig.json, and index.ts", () => {
      const result = planWorkspacePackage(baseInput);

      expect([...result.files.keys()]).toEqual([packageJsonPath, tsconfigPath, indexPath]);
      expect(JSON.parse(readFile(result, packageJsonPath))).toEqual({
        name: "@acme/shared",
        version: "0.0.0",
        private: true,
        type: "module",
        exports: { ".": "./src/index.ts" },
        scripts: { "check-types": "tsc --noEmit" },
        devDependencies: {
          "@acme/config": "workspace:*",
          typescript: "^6.0.3",
        },
      });
      expect(JSON.parse(readFile(result, tsconfigPath))).toEqual({
        extends: "@acme/config/tsconfig.base.json",
        include: ["src/**/*.ts"],
      });
      expect(readFile(result, indexPath)).toBe("export {};\n");
      expect(result.warnings).toEqual([]);
      expect(result.rootFiles.size).toBe(0);
      expect(result.envGeneratePath).toBeUndefined();
    });

    it("serializes JSON with two-space indent and a trailing newline", () => {
      const result = planWorkspacePackage(baseInput);

      expect(readFile(result, packageJsonPath)).toBe(
        `${JSON.stringify(JSON.parse(readFile(result, packageJsonPath)), null, 2)}\n`,
      );
      expect(readFile(result, tsconfigPath)).toBe(
        `${JSON.stringify(JSON.parse(readFile(result, tsconfigPath)), null, 2)}\n`,
      );
    });

    it("uses a wildcard config dependency for npm", () => {
      const result = planWorkspacePackage({ ...baseInput, packageManager: "npm" });

      const pkg = JSON.parse(readFile(result, packageJsonPath)) as {
        devDependencies: Record<string, string>;
      };
      expect(pkg.devDependencies["@acme/config"]).toBe("*");
    });

    it("uses a workspace protocol config dependency for pnpm", () => {
      const result = planWorkspacePackage({ ...baseInput, packageManager: "pnpm" });

      const pkg = JSON.parse(readFile(result, packageJsonPath)) as {
        devDependencies: Record<string, string>;
      };
      expect(pkg.devDependencies["@acme/config"]).toBe("workspace:*");
    });
  });

  describe("env validation", () => {
    it("adds the varlock schema and gitignore without generating env.ts", () => {
      const result = planWorkspacePackage({ ...baseInput, envValidation: true });

      expect([...result.files.keys()]).toEqual([
        packageJsonPath,
        tsconfigPath,
        indexPath,
        envSchemaPath,
        gitignorePath,
      ]);
      expect(readFile(result, envSchemaPath)).toContain(
        "# @generateTsTypes(path=./src/env.ts, exposeEnv=local)",
      );
      expect(readFile(result, envSchemaPath)).toContain("EXAMPLE_KEY=");
      expect(readFile(result, gitignorePath)).toBe("!.env.schema\n/src/env.ts\n");
      expect(result.files.has("packages/shared/src/env.ts")).toBe(false);
      expect(readFile(result, indexPath)).toBe("export {};\n");
      expect(result.envGeneratePath).toBe("packages/shared");
    });

    it("adds varlock and env:generate to the package.json", () => {
      const result = planWorkspacePackage({ ...baseInput, envValidation: true });

      const pkg = JSON.parse(readFile(result, packageJsonPath)) as {
        scripts: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      // varlock appears in both the mutated root and the new package, so the
      // catalog step dedupes it into a root catalog reference.
      expect(pkg.devDependencies.varlock).toBe("catalog:");
      expect(pkg.scripts["env:generate"]).toBe("varlock codegen");
      expect(pkg.scripts["check-types"]).toBe("tsc --noEmit");

      const root = JSON.parse(readRootFile(result, "package.json")) as PackageJson;
      expect(root.workspaces?.catalog?.varlock).toBe(dependencyVersionMap.varlock);
    });
  });

  describe("root package.json mutation", () => {
    it("preserves fields and appends the varlock codegen command to scripts", () => {
      const result = planWorkspacePackage({
        ...baseInput,
        envValidation: true,
        existingRootPackageJson: {
          name: "acme",
          scripts: { postinstall: "echo hi" },
          devDependencies: {},
        },
      });

      expect(JSON.parse(readRootFile(result, "package.json")) as PackageJson).toEqual({
        name: "acme",
        scripts: {
          postinstall: "echo hi && varlock codegen --path ./packages/shared/",
          "env:generate": "varlock codegen --path ./packages/shared/",
        },
        devDependencies: { varlock: "catalog:" },
        workspaces: { catalog: { varlock: dependencyVersionMap.varlock } },
      });
    });

    it("keeps an existing varlock pin and joins an existing env:generate", () => {
      const result = planWorkspacePackage({
        ...baseInput,
        envValidation: true,
        existingRootPackageJson: {
          scripts: { "env:generate": "turbo run x", postinstall: "" },
          devDependencies: { varlock: "0.0.1" },
        },
      });

      expect(JSON.parse(readRootFile(result, "package.json")) as PackageJson).toEqual({
        scripts: {
          "env:generate": "turbo run x && varlock codegen --path ./packages/shared/",
          postinstall: "varlock codegen --path ./packages/shared/",
        },
        devDependencies: { varlock: "0.0.1" },
      });
    });

    it("does not mutate the caller's root package.json", () => {
      const existingRootPackageJson = {
        name: "acme",
        scripts: { postinstall: "echo hi" },
        devDependencies: {},
      };

      planWorkspacePackage({
        ...baseInput,
        envValidation: true,
        existingRootPackageJson,
      });

      expect(existingRootPackageJson).toEqual({
        name: "acme",
        scripts: { postinstall: "echo hi" },
        devDependencies: {},
      });
    });

    it("includes the root file when env validation mutates it", () => {
      const result = planWorkspacePackage({
        ...baseInput,
        envValidation: true,
        existingRootPackageJson: { scripts: {}, devDependencies: {} },
      });

      expect(result.envGeneratePath).toBe("packages/shared");
      expect(result.rootFiles.has("package.json")).toBe(true);
    });

    it("omits root mutations when env validation is disabled", () => {
      const result = planWorkspacePackage(baseInput);

      expect(result.rootFiles.size).toBe(0);
      expect(result.envGeneratePath).toBeUndefined();
      expect(readFile(result, packageJsonPath)).not.toContain("varlock");
    });
  });

  describe("catalog reuse", () => {
    it("rewrites the new package's shared dependency to the existing catalog", () => {
      const result = planWorkspacePackage({
        ...baseInput,
        existingFiles: new Map([
          [
            "package.json",
            JSON.stringify({ name: "acme", devDependencies: { typescript: "^6.0.3" } }),
          ],
          [
            "packages/api/package.json",
            JSON.stringify({ name: "@acme/api", devDependencies: { typescript: "^6.0.3" } }),
          ],
          ["packages/config/package.json", JSON.stringify({ name: "@acme/config" })],
        ]),
      });

      const pkg = JSON.parse(readFile(result, packageJsonPath)) as PackageJson;
      expect(pkg.devDependencies?.typescript).toBe("catalog:");
      expect(pkg.devDependencies?.["@acme/config"]).toBe("workspace:*");

      const root = JSON.parse(readRootFile(result, "package.json")) as PackageJson;
      expect(root.workspaces?.catalog?.typescript).toBe("^6.0.3");
    });
  });
});
