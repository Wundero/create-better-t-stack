import path from "node:path";

import {
  planWorkspacePackage,
  VirtualFileSystem,
  WORKSPACE_PACKAGE_DIRS,
  type PlanWorkspacePackageInput,
} from "@better-t-stack/template-generator";
import { Result } from "better-result";
import fs from "fs-extra";
import z from "zod";

import type { ProjectConfig } from "../../types";
import { CLIError } from "../../utils/errors";

const fileExistsErrorSchema = z.object({ code: z.literal("EEXIST") });
const configPackageScopeSchema = z
  .object({
    name: z.string().regex(/^@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/config$/),
  })
  .transform(({ name }) => name.slice(0, -"/config".length));
const rootTypescriptVersionSchema = z
  .object({
    devDependencies: z.object({ typescript: z.string().min(1) }),
  })
  .transform(({ devDependencies }) => devDependencies.typescript);

type ExistingRootPackageJson = NonNullable<PlanWorkspacePackageInput["existingRootPackageJson"]>;

function isFileExistsError(cause: unknown): boolean {
  return fileExistsErrorSchema.safeParse(cause).success;
}

export async function reserveWorkspacePackage(
  projectDir: string,
  packageName: string,
): Promise<Result<string, CLIError>> {
  const packageDir = path.join(projectDir, "packages", packageName);

  return Result.tryPromise({
    try: async () => {
      await fs.mkdir(packageDir);
      return packageDir;
    },
    catch: (cause: unknown) =>
      new CLIError({
        message: isFileExistsError(cause)
          ? `Workspace package already exists: packages/${packageName}`
          : `Failed to reserve workspace package: packages/${packageName}`,
        cause,
      }),
  });
}

export async function addWorkspacePackage(
  vfs: VirtualFileSystem,
  projectDir: string,
  packageName: string,
  packageManager: ProjectConfig["packageManager"],
  envValidation?: boolean,
): Promise<Result<void, CLIError>> {
  const packageDir = path.join(projectDir, "packages", packageName);
  if (await fs.pathExists(packageDir)) {
    return Result.err(
      new CLIError({
        message: `Workspace package already exists: packages/${packageName}`,
      }),
    );
  }

  const configPackagePath = path.join(projectDir, "packages", "config", "package.json");
  const packageScopeResult = await Result.tryPromise({
    try: async () => configPackageScopeSchema.parse(await fs.readJson(configPackagePath)),
    catch: (cause: unknown) =>
      new CLIError({
        message:
          "Cannot determine the workspace package scope. Expected packages/config/package.json to have a name like @my-app/config.",
        cause,
      }),
  });
  if (packageScopeResult.isErr()) {
    return Result.err(packageScopeResult.error);
  }

  const rootPackagePath = path.join(projectDir, "package.json");
  const rootPackageResult = await Result.tryPromise({
    try: async () => {
      const existingRootPackageJson: ExistingRootPackageJson = await fs.readJson(rootPackagePath);
      return {
        existingRootPackageJson,
        typescriptVersion: rootTypescriptVersionSchema.parse(existingRootPackageJson),
      };
    },
    catch: (cause: unknown) =>
      new CLIError({
        message:
          "Cannot determine the TypeScript version. Expected package.json to declare devDependencies.typescript.",
        cause,
      }),
  });
  if (rootPackageResult.isErr()) {
    return Result.err(rootPackageResult.error);
  }

  const packageScope = packageScopeResult.value;
  const fullPackageName = `${packageScope}/${packageName}`;
  if (fullPackageName.length > 214) {
    return Result.err(
      new CLIError({
        message: "Workspace package name must not exceed 214 characters including its scope.",
      }),
    );
  }

  const existingFiles = await preloadExistingWorkspaceFiles(projectDir);

  const plan = planWorkspacePackage({
    packageName,
    packageScope,
    packageManager,
    typescriptVersion: rootPackageResult.value.typescriptVersion,
    envValidation,
    existingRootPackageJson: rootPackageResult.value.existingRootPackageJson,
    existingFiles,
  });

  for (const [filePath, content] of plan.files) {
    vfs.writeFile(filePath, content);
  }

  for (const [filePath, content] of plan.rootFiles) {
    vfs.writeFile(filePath, content);
  }

  return Result.ok(undefined);
}

async function preloadExistingWorkspaceFiles(projectDir: string): Promise<Map<string, string>> {
  const existingFiles = new Map<string, string>();
  const candidates = [
    "package.json",
    "pnpm-workspace.yaml",
    ...WORKSPACE_PACKAGE_DIRS.map((dir) => `${dir}/package.json`),
  ];
  for (const filePath of candidates) {
    const fullPath = path.join(projectDir, filePath);
    if (await fs.pathExists(fullPath)) {
      existingFiles.set(filePath, await fs.readFile(fullPath, "utf-8"));
    }
  }
  return existingFiles;
}
