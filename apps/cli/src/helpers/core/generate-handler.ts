import path from "node:path";

import {
  EMBEDDED_TEMPLATES,
  planWorkspaceApp,
  planWorkspacePackage,
  VirtualFileSystem,
  WORKSPACE_PACKAGE_DIRS,
} from "@better-t-stack/template-generator";
import type { PlanWorkspacePackageInput } from "@better-t-stack/template-generator";
import { writeTree } from "@better-t-stack/template-generator/fs-writer";
import { intro, log, outro } from "@clack/prompts";
import { Result } from "better-result";
import fs from "fs-extra";
import pc from "picocolors";
import z from "zod";

import type {
  AnalyticsMode,
  PackageManager,
  ProjectConfig,
  ScaffoldAppInput,
  ScaffoldPackageInput,
} from "../../types";
import { TASK_RUNNER_ADDONS } from "../../utils/compatibility-rules";
import { isSilent, resolveInvocationMode, runWithContextAsync } from "../../utils/context";
import { errorClass, failureStage, reportDiagnostic, scrubReason } from "../../utils/diagnostics";
import { CLIError, UserCancelledError, displayError } from "../../utils/errors";
import { validateAgentSafePathInput } from "../../utils/input-hardening";
import { beginInterruptibleScope, endInterruptibleScope } from "../../utils/interrupt";
import { renderTitle } from "../../utils/render-title";
import { checkLocalRequirements } from "../../utils/requirements";
import { detectProjectConfig } from "./detect-project-config";
import { installDependencies } from "./install-dependencies";

export interface GenerateHandlerOptions {
  silent?: boolean;
  mode?: AnalyticsMode;
}

export interface GeneratePackageResult {
  success: boolean;
  kind: "package";
  projectDir: string;
  name: string;
  dryRun?: boolean;
  plannedFileCount?: number;
  warnings?: string[];
  error?: string;
}

export interface GenerateAppResult {
  success: boolean;
  kind: "app";
  projectDir: string;
  name: string;
  appKind: "frontend" | "backend" | "mobile";
  dryRun?: boolean;
  plannedFileCount?: number;
  warnings?: string[];
  error?: string;
}

type DetectedProject = NonNullable<Awaited<ReturnType<typeof detectProjectConfig>>>;
type RootPackageJson = NonNullable<PlanWorkspacePackageInput["existingRootPackageJson"]>;

const MAX_PACKAGE_NAME_LENGTH = 214;
const WORKSPACE_PACKAGE_SCOPE_PATTERN = /^@[^/]+\/config$/;
const fileExistsErrorSchema = z.object({ code: z.literal("EEXIST") });
const configPackageScopeSchema = z
  .object({ name: z.string().regex(WORKSPACE_PACKAGE_SCOPE_PATTERN) })
  .transform(({ name }) => name.slice(0, -"/config".length));
const rootTypescriptVersionSchema = z
  .object({
    devDependencies: z.object({ typescript: z.string().min(1) }),
  })
  .transform(({ devDependencies }) => devDependencies.typescript);

function isFileExistsError(cause: unknown): boolean {
  return fileExistsErrorSchema.safeParse(cause).success;
}

function buildProjectConfig(
  detected: DetectedProject,
  projectDir: string,
  packageManager: PackageManager,
): ProjectConfig {
  return {
    projectName: detected.projectName,
    projectDir,
    relativePath: ".",
    addonOptions: detected.addonOptions,
    database: detected.database,
    orm: detected.orm,
    backend: detected.backend,
    runtime: detected.runtime,
    frontend: detected.frontend,
    addons: detected.addons,
    examples: detected.examples,
    auth: detected.auth,
    payments: detected.payments,
    git: false,
    packageManager,
    install: false,
    dbSetup: detected.dbSetup,
    api: detected.api,
    webDeploy: detected.webDeploy,
    serverDeploy: detected.serverDeploy,
  };
}

async function snapshotFile(filePath: string): Promise<string | undefined> {
  return (await fs.pathExists(filePath)) ? fs.readFile(filePath, "utf-8") : undefined;
}

async function restoreFile(filePath: string, content: string | undefined): Promise<void> {
  if (content === undefined) {
    await fs.remove(filePath);
    return;
  }
  await fs.writeFile(filePath, content, "utf-8");
}

interface WritePlannedTreeInput {
  vfs: VirtualFileSystem;
  projectDir: string;
  config: ProjectConfig;
  reserveDir: string;
  reserveErrorMessage: string;
}

async function writePlannedTree(input: WritePlannedTreeInput): Promise<Result<number, CLIError>> {
  const { vfs, projectDir, config, reserveDir, reserveErrorMessage } = input;
  const rootPackagePath = path.join(projectDir, "package.json");
  const rootSnapshot = await snapshotFile(rootPackagePath);

  const reservationResult = await Result.tryPromise({
    try: async () => {
      await fs.mkdir(reserveDir);
      return reserveDir;
    },
    catch: (cause: unknown) =>
      new CLIError({
        message: isFileExistsError(cause) ? reserveErrorMessage : `Failed to reserve ${reserveDir}`,
        cause,
      }),
  });
  if (reservationResult.isErr()) {
    return Result.err(reservationResult.error);
  }

  const tree = {
    root: vfs.toTree(""),
    fileCount: vfs.getFileCount(),
    directoryCount: vfs.getDirectoryCount(),
    config,
  };

  const writeResult = await writeTree(tree, projectDir);
  if (writeResult.isErr()) {
    const cleanupResult = await Result.tryPromise({
      try: async () => {
        await fs.remove(reserveDir);
        await restoreFile(rootPackagePath, rootSnapshot);
      },
      catch: (cause: unknown) =>
        new CLIError({
          message: `Failed to clean up incomplete files under ${reserveDir}`,
          cause,
        }),
    });
    if (cleanupResult.isErr()) {
      return Result.err(
        new CLIError({
          message: `Failed to write files: ${writeResult.error.message}. ${cleanupResult.error.message}`,
          cause: cleanupResult.error,
        }),
      );
    }
    return Result.err(
      new CLIError({ message: `Failed to write files: ${writeResult.error.message}` }),
    );
  }

  return Result.ok(vfs.getFileCount());
}

async function reportGenerateOutcome<T>(
  input: ScaffoldPackageInput | ScaffoldAppInput,
  result: Result<T, UserCancelledError | CLIError>,
): Promise<void> {
  if (result.isOk()) return;

  const error = result.error;
  if (UserCancelledError.is(error)) return;

  await reportDiagnostic("cli_failed", {
    command: "generate",
    mode: resolveInvocationMode(false),
    stage: failureStage(error),
    error: errorClass(error),
    reason: scrubReason(error),
    packageManager: input.packageManager,
  });
}

interface RunGenerateInput<T> {
  input: ScaffoldPackageInput | ScaffoldAppInput;
  options: GenerateHandlerOptions;
  internal: () => Promise<Result<T, UserCancelledError | CLIError>>;
  failure: (message: string) => T;
}

async function runGenerate<T>({
  input,
  options,
  internal,
  failure,
}: RunGenerateInput<T>): Promise<T | undefined> {
  const { silent = false, mode } = options;

  return runWithContextAsync(
    { silent, mode, analyticsDisabled: input.disableAnalytics },
    async () => {
      let result: Result<T, UserCancelledError | CLIError>;
      try {
        result = await internal();
      } finally {
        endInterruptibleScope();
      }
      await reportGenerateOutcome(input, result);

      if (result.isOk()) {
        return result.value;
      }

      const error = result.error;
      if (UserCancelledError.is(error) && !isSilent()) {
        return undefined;
      }

      if (isSilent()) {
        return failure(error.message);
      }

      displayError(error);
      process.exit(1);
    },
  );
}

export async function generatePackageHandler(
  input: ScaffoldPackageInput,
  options: GenerateHandlerOptions = {},
): Promise<GeneratePackageResult | undefined> {
  return runGenerate({
    input,
    options,
    internal: () => generatePackageInternal(input),
    failure: (message) => ({
      success: false,
      kind: "package",
      projectDir: input.projectDir ?? "",
      name: input.name,
      error: message,
    }),
  });
}

export async function generateAppHandler(
  input: ScaffoldAppInput,
  options: GenerateHandlerOptions = {},
): Promise<GenerateAppResult | undefined> {
  return runGenerate({
    input,
    options,
    internal: () => generateAppInternal(input),
    failure: (message) => ({
      success: false,
      kind: "app",
      projectDir: input.projectDir ?? "",
      name: input.name,
      appKind: input.kind,
      error: message,
    }),
  });
}

async function generatePackageInternal(
  input: ScaffoldPackageInput,
): Promise<Result<GeneratePackageResult, UserCancelledError | CLIError>> {
  const projectDirInput = input.projectDir || process.cwd();
  const hardeningResult = validateAgentSafePathInput(projectDirInput, "projectDir");
  if (hardeningResult.isErr()) {
    return Result.err(
      new CLIError({ message: hardeningResult.error.message, cause: hardeningResult.error }),
    );
  }

  const projectDir = path.resolve(projectDirInput);

  if (!isSilent()) {
    renderTitle();
    intro(pc.magenta("Generate a package"));
  }

  const detected = await detectProjectConfig(projectDir);
  if (!detected) {
    return Result.err(
      new CLIError({
        message: `No Better-T-Stack project found in "${projectDir}". Make sure bts.jsonc exists.`,
      }),
    );
  }

  if (!isSilent()) {
    log.info(pc.dim(`Detected project: ${detected.projectName}`));
  }

  const packageManager = input.packageManager ?? detected.packageManager;

  const scopeResult = await Result.tryPromise({
    try: async () =>
      configPackageScopeSchema.parse(
        await fs.readJson(path.join(projectDir, "packages", "config", "package.json")),
      ),
    catch: (cause: unknown) =>
      new CLIError({
        message:
          "Cannot determine the workspace package scope. Expected packages/config/package.json to have a name like @my-app/config.",
        cause,
      }),
  });
  if (scopeResult.isErr()) {
    return Result.err(scopeResult.error);
  }

  if (`${scopeResult.value}/${input.name}`.length > MAX_PACKAGE_NAME_LENGTH) {
    return Result.err(
      new CLIError({
        message: "Workspace package name must not exceed 214 characters including its scope.",
      }),
    );
  }

  const rootJsonResult = await Result.tryPromise({
    try: async () => {
      const existingRootPackageJson: RootPackageJson = await fs.readJson(
        path.join(projectDir, "package.json"),
      );
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
  if (rootJsonResult.isErr()) {
    return Result.err(rootJsonResult.error);
  }

  const existingFiles = await preloadExistingAppFiles(projectDir);

  const plan = planWorkspacePackage({
    packageName: input.name,
    packageScope: scopeResult.value,
    packageManager,
    typescriptVersion: rootJsonResult.value.typescriptVersion,
    envValidation: input.envValidation,
    existingRootPackageJson: rootJsonResult.value.existingRootPackageJson,
    existingFiles,
  });

  const vfs = new VirtualFileSystem();
  for (const [filePath, content] of plan.files) {
    vfs.writeFile(filePath, content);
  }
  for (const [filePath, content] of plan.rootFiles) {
    vfs.writeFile(filePath, content);
  }

  if (!isSilent()) {
    for (const warning of plan.warnings) {
      log.warn(pc.yellow(warning));
    }
  }

  if (input.dryRun) {
    if (!isSilent()) {
      log.success(pc.green("Dry run passed · no files written"));
      log.message(pc.dim(`${vfs.getFileCount()} files planned`));
      outro(pc.dim("Project unchanged"));
    }
    return Result.ok({
      success: true,
      kind: "package",
      projectDir,
      name: input.name,
      dryRun: true,
      plannedFileCount: vfs.getFileCount(),
      warnings: plan.warnings,
    });
  }

  const writeResult = await writePlannedTree({
    vfs,
    projectDir,
    config: buildProjectConfig(detected, projectDir, packageManager),
    reserveDir: path.join(projectDir, "packages", input.name),
    reserveErrorMessage: `Workspace package already exists: packages/${input.name}`,
  });
  if (writeResult.isErr()) {
    return Result.err(writeResult.error);
  }

  beginInterruptibleScope();

  if (input.install) {
    await installDependencies({ projectDir, packageManager });
  }

  if (!isSilent()) {
    log.info(pc.dim(`Wrote ${vfs.getFileCount()} files`));
    if (input.envValidation) {
      log.info(
        `Env types wired into root scripts for packages/${input.name} · run "${packageManager} run env:generate"`,
      );
    }
    outro(pc.magenta("Package generated"));
  }

  return Result.ok({
    success: true,
    kind: "package",
    projectDir,
    name: input.name,
    plannedFileCount: vfs.getFileCount(),
    warnings: plan.warnings,
  });
}

async function preloadExistingAppFiles(projectDir: string): Promise<Map<string, string>> {
  const existingFiles = new Map<string, string>();
  const candidates = ["package.json", "pnpm-workspace.yaml"];
  for (const filePath of candidates) {
    const fullPath = path.join(projectDir, filePath);
    if (await fs.pathExists(fullPath)) {
      existingFiles.set(filePath, await fs.readFile(fullPath, "utf-8"));
    }
  }
  for (const dir of WORKSPACE_PACKAGE_DIRS) {
    const filePath = `${dir}/package.json`;
    const fullPath = path.join(projectDir, filePath);
    if (await fs.pathExists(fullPath)) {
      existingFiles.set(filePath, await fs.readFile(fullPath, "utf-8"));
    }
  }
  return existingFiles;
}

async function generateAppInternal(
  input: ScaffoldAppInput,
): Promise<Result<GenerateAppResult, UserCancelledError | CLIError>> {
  const projectDirInput = input.projectDir || process.cwd();
  const hardeningResult = validateAgentSafePathInput(projectDirInput, "projectDir");
  if (hardeningResult.isErr()) {
    return Result.err(
      new CLIError({ message: hardeningResult.error.message, cause: hardeningResult.error }),
    );
  }

  const projectDir = path.resolve(projectDirInput);

  if (!isSilent()) {
    renderTitle();
    intro(pc.magenta("Generate an app"));
  }

  const detected = await detectProjectConfig(projectDir);
  if (!detected) {
    return Result.err(
      new CLIError({
        message: `No Better-T-Stack project found in "${projectDir}". Make sure bts.jsonc exists.`,
      }),
    );
  }

  const taskRunners = TASK_RUNNER_ADDONS.filter((addon) => detected.addons.includes(addon));
  if (taskRunners.length === 0) {
    return Result.err(
      new CLIError({
        message:
          'App generation requires a task runner (Turborepo, Nx, or Vite+). Run "create-better-t-stack add turborepo" first.',
      }),
    );
  }

  const packageManager = input.packageManager ?? detected.packageManager;
  const config = buildProjectConfig(detected, projectDir, packageManager);

  const requirementsResult = await checkLocalRequirements(config);
  if (requirementsResult.isErr()) {
    return Result.err(requirementsResult.error);
  }
  if (!isSilent()) {
    for (const warning of requirementsResult.value.warnings) {
      log.warn(pc.yellow(warning));
    }
  }

  const existingFiles = await preloadExistingAppFiles(projectDir);

  const planResult = await Result.tryPromise({
    try: async () =>
      planWorkspaceApp({
        config,
        kind: input.kind,
        name: input.name,
        frontend: input.frontend,
        backend: input.backend,
        existingFiles,
        templates: EMBEDDED_TEMPLATES,
      }),
    catch: (cause: unknown) =>
      new CLIError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });
  if (planResult.isErr()) {
    return Result.err(planResult.error);
  }

  const vfs = new VirtualFileSystem();
  for (const [filePath, content] of planResult.value.files) {
    vfs.writeFile(filePath, content);
  }
  for (const [filePath, content] of planResult.value.rootFiles) {
    vfs.writeFile(filePath, content);
  }

  if (!isSilent()) {
    for (const warning of planResult.value.warnings) {
      log.warn(pc.yellow(warning));
    }
  }

  if (input.dryRun) {
    if (!isSilent()) {
      log.success(pc.green("Dry run passed · no files written"));
      log.message(pc.dim(`${vfs.getFileCount()} files planned`));
      outro(pc.dim("Project unchanged"));
    }
    return Result.ok({
      success: true,
      kind: "app",
      projectDir,
      name: input.name,
      appKind: input.kind,
      dryRun: true,
      plannedFileCount: vfs.getFileCount(),
      warnings: planResult.value.warnings,
    });
  }

  const writeResult = await writePlannedTree({
    vfs,
    projectDir,
    config,
    reserveDir: path.join(projectDir, "apps", input.name),
    reserveErrorMessage: `App already exists: apps/${input.name}`,
  });
  if (writeResult.isErr()) {
    return Result.err(writeResult.error);
  }

  beginInterruptibleScope();

  if (input.install) {
    await installDependencies({ projectDir, packageManager });
  }

  if (!isSilent()) {
    log.info(pc.dim(`Wrote ${vfs.getFileCount()} files`));
    if (planResult.value.envGeneratePath !== undefined) {
      log.info(
        `Env types wired into root scripts for ${planResult.value.envGeneratePath} · run "${packageManager} run env:generate"`,
      );
    }
    outro(pc.magenta("App generated"));
  }

  return Result.ok({
    success: true,
    kind: "app",
    projectDir,
    name: input.name,
    appKind: input.kind,
    plannedFileCount: vfs.getFileCount(),
    warnings: planResult.value.warnings,
  });
}
