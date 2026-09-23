import type { PackageManager } from "@better-t-stack/types";

import type { JsonValue } from "../core/json-types";
import { VirtualFileSystem } from "../core/virtual-fs";
import { processCatalogs } from "../post-process/catalogs";
import { dependencyVersionMap } from "../utils/add-deps";

/** Owner contract for a project root package.json, preserving unknown extra fields as JSON. */
export interface RootPackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: JsonValue | undefined;
}

export interface PlanWorkspacePackageInput {
  /** Unscoped package name, e.g. "shared". */
  packageName: string;
  /** Package scope including the leading "@", e.g. "@acme". */
  packageScope: string;
  packageManager: PackageManager;
  /** TypeScript version read from the project root, e.g. "^6.0.3". */
  typescriptVersion: string;
  envValidation?: boolean;
  /** Current project root package.json, used for env-validation mutations. */
  existingRootPackageJson?: RootPackageJson;
  /** Existing project files (root package.json, pnpm-workspace.yaml, packages/*). */
  existingFiles?: Map<string, string>;
}

export interface PlanWorkspacePackageResult {
  /** Destination path -> file content for the new package. */
  files: Map<string, string>;
  /** Changed root-level files to persist: package.json and/or pnpm-workspace.yaml. */
  rootFiles: Map<string, string>;
  /** Env generation target, only when env validation is enabled. */
  envGeneratePath?: string;
  warnings: string[];
}

function serializeJson(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function joinCommands(existing: string | undefined, command: string): string {
  return [existing, command].filter((part): part is string => Boolean(part)).join(" && ");
}

const ENV_SCHEMA = [
  "# @defaultRequired=true",
  "# @defaultSensitive=true",
  "# @currentEnv=$NODE_ENV",
  "# @generateTsTypes(path=./src/env.ts, exposeEnv=local)",
  "# ---",
  "",
  "# @public @type=enum(development, production, test)",
  "NODE_ENV=development",
  "",
  "# @required @type=string(minLength=1)",
  "EXAMPLE_KEY=",
  "",
].join("\n");

const GITIGNORE = "!.env.schema\n/src/env.ts\n";

export function planWorkspacePackage(input: PlanWorkspacePackageInput): PlanWorkspacePackageResult {
  const {
    packageName,
    packageScope,
    packageManager,
    typescriptVersion,
    envValidation = false,
    existingRootPackageJson,
    existingFiles,
  } = input;

  const packagePath = `packages/${packageName}`;
  const files = new Map<string, string>();

  const scripts: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  scripts["check-types"] = "tsc --noEmit";
  devDependencies[`${packageScope}/config`] = packageManager === "npm" ? "*" : "workspace:*";
  devDependencies.typescript = typescriptVersion;

  if (envValidation) {
    scripts["env:generate"] = "varlock codegen";
    devDependencies.varlock = dependencyVersionMap.varlock;
  }

  files.set(
    `${packagePath}/package.json`,
    serializeJson({
      name: `${packageScope}/${packageName}`,
      version: "0.0.0",
      private: true,
      type: "module",
      exports: { ".": "./src/index.ts" },
      scripts,
      devDependencies,
    }),
  );
  files.set(
    `${packagePath}/tsconfig.json`,
    serializeJson({
      extends: `${packageScope}/config/tsconfig.base.json`,
      include: ["src/**/*.ts"],
    }),
  );
  files.set(`${packagePath}/src/index.ts`, "export {};\n");

  let envGeneratePath: string | undefined;
  let root: RootPackageJson | undefined;

  if (envValidation) {
    files.set(`${packagePath}/.env.schema`, ENV_SCHEMA);
    files.set(`${packagePath}/.gitignore`, GITIGNORE);

    const command = `varlock codegen --path ./${packagePath}/`;
    root = { ...existingRootPackageJson };
    const rootScripts = { ...root.scripts };
    const rootDevDependencies = { ...root.devDependencies };

    if (!Object.hasOwn(rootDevDependencies, "varlock")) {
      rootDevDependencies.varlock = dependencyVersionMap.varlock;
    }

    root.scripts = {
      ...rootScripts,
      "env:generate": joinCommands(rootScripts["env:generate"], command),
      postinstall: joinCommands(rootScripts.postinstall, command),
    };
    root.devDependencies = rootDevDependencies;
    envGeneratePath = packagePath;
  }

  const vfs = new VirtualFileSystem();
  if (existingFiles !== undefined) {
    for (const [path, content] of existingFiles) {
      vfs.writeFile(path, content);
    }
  }
  for (const [path, content] of files) {
    vfs.writeFile(path, content);
  }
  if (root !== undefined) {
    vfs.writeFile("package.json", serializeJson(root));
  }

  processCatalogs(vfs, { packageManager, projectName: packageScope.replace(/^@/, "") }, [
    packagePath,
  ]);

  const rewrittenPackageJson = vfs.readJson<JsonValue>(`${packagePath}/package.json`);
  if (rewrittenPackageJson !== undefined) {
    files.set(`${packagePath}/package.json`, serializeJson(rewrittenPackageJson));
  }

  const rootFiles = new Map<string, string>();
  for (const path of ["package.json", "pnpm-workspace.yaml"] as const) {
    const current = vfs.readFile(path);
    if (current === undefined) continue;
    const previous = existingFiles?.get(path);
    if (previous === undefined || previous.trimEnd() !== current.trimEnd()) {
      rootFiles.set(path, current);
    }
  }

  const result: PlanWorkspacePackageResult = { files, rootFiles, warnings: [] };
  if (envGeneratePath !== undefined) {
    result.envGeneratePath = envGeneratePath;
  }
  return result;
}
