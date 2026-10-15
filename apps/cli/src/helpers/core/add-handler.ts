import path from "node:path";

import {
  EMBEDDED_TEMPLATES,
  processAddonTemplates,
  processAddonsDeps,
  processNxConfig,
  processPackageConfigs,
  processPnpmWorkspaceConfig,
  processNpmScriptApprovals,
  processPwaPlugins,
  processTurboConfig,
  processVitePlusConfig,
  processTemplateString,
  VirtualFileSystem,
} from "@better-t-stack/template-generator";
import { writeTree } from "@better-t-stack/template-generator/fs-writer";
import { intro, log, outro } from "@clack/prompts";
import { Result } from "better-result";
import fs from "fs-extra";
import pc from "picocolors";
import z from "zod";

import { getAddonsToAdd } from "../../prompts/addons";
import { getI18nLibraryChoice, getI18nOptionsChoice } from "../../prompts/i18n";
import { isGoBack } from "../../prompts/navigable";
import type {
  AddInput,
  Addons,
  AddonOptions,
  AnalyticsMode,
  I18nConfigInput,
  I18nLibrary,
  I18nOptions,
  ProjectConfig,
} from "../../types";
import { I18N_LIBRARY_META, I18nOptionsSchema } from "../../types";
import { updateBtsConfig } from "../../utils/bts-config";
import { TASK_RUNNER_ADDONS, validateAddonsAgainstConfig } from "../../utils/compatibility-rules";
import { isSilent, resolveInvocationMode, runWithContextAsync } from "../../utils/context";
import { errorClass, failureStage, reportDiagnostic, scrubReason } from "../../utils/diagnostics";
import { formatConfigValue } from "../../utils/display-config";
import { CLIError, UserCancelledError, displayError } from "../../utils/errors";
import {
  toI18nConfigInput,
  validateI18nConfig,
  type I18nCliFlagFields,
} from "../../utils/i18n-cli";
import { validateAgentSafePathInput } from "../../utils/input-hardening";
import { beginInterruptibleScope, endInterruptibleScope } from "../../utils/interrupt";
import { renderTitle } from "../../utils/render-title";
import { checkLocalRequirements } from "../../utils/requirements";
import { setupAddons } from "../addons/addons-setup";
import { detectProjectConfig } from "./detect-project-config";
import {
  i18nLibrarySwitchError,
  renderPlan,
  runI18nRetrofit,
  writeI18nToBtsConfig,
  type RetrofitResult,
} from "./i18n-retrofit";
import { installDependencies } from "./install-dependencies";

export interface AddHandlerOptions {
  silent?: boolean;
  mode?: AnalyticsMode;
}

/**
 * Add Path input. On top of `AddInput` the CLI folds the flat `--i18n-*` flags
 * into a fully resolved `i18nOptions`, so the raw flags are carried alongside
 * for the add-locales merge to know which fields the caller set explicitly.
 */
export type AddHandlerInput = AddInput & Partial<I18nCliFlagFields>;

/** Which i18n fields the caller set explicitly (vs. schema defaults). */
interface I18nFlagIntent {
  locales: boolean;
  sourceLocale: boolean;
  routing: boolean;
  translateSkill: boolean;
}

function resolveI18nFlagIntent(input: AddHandlerInput): I18nFlagIntent {
  const hasFlatFlags =
    input.i18nLocales !== undefined ||
    input.i18nSourceLocale !== undefined ||
    input.i18nRouting !== undefined ||
    input.i18nDomain !== undefined ||
    input.i18nSkill !== undefined;

  if (hasFlatFlags) {
    return {
      locales: input.i18nLocales !== undefined,
      sourceLocale: input.i18nSourceLocale !== undefined,
      routing: input.i18nRouting !== undefined || input.i18nDomain !== undefined,
      translateSkill: input.i18nSkill !== undefined,
    };
  }

  return {
    locales: input.i18nOptions?.locales !== undefined,
    sourceLocale: input.i18nOptions?.sourceLocale !== undefined,
    routing: input.i18nOptions?.routing !== undefined,
    translateSkill: input.i18nOptions?.translateSkill !== undefined,
  };
}

/**
 * Add-locales merge (design D9): `bts add` never removes locales, so a request
 * is unioned onto the existing set (existing order preserved, new locales
 * appended). Source locale, routing and the translate-skill toggle are kept
 * from the existing config unless the caller flagged them explicitly.
 */
function mergeAddLocalesOptions(
  existing: I18nOptions | undefined,
  requested: I18nOptions,
  intent: I18nFlagIntent,
): I18nOptions {
  const base = I18nOptionsSchema.parse(existing ?? {});
  const locales = [...base.locales];
  for (const locale of requested.locales) {
    if (!locales.includes(locale)) locales.push(locale);
  }

  const merged: I18nOptions = {
    sourceLocale: intent.sourceLocale ? requested.sourceLocale : base.sourceLocale,
    locales,
    translateSkill: intent.translateSkill ? requested.translateSkill : base.translateSkill,
  };
  const routing = intent.routing ? requested.routing : base.routing;
  if (routing !== undefined) merged.routing = routing;

  return I18nOptionsSchema.parse(merged);
}

export interface AddResult {
  success: boolean;
  addedAddons: Addons[];
  projectDir: string;
  dryRun?: boolean;
  plannedFileCount?: number;
  addedPackage?: string;
  error?: string;
}

const ADD_PACKAGE_JSON_PATHS = [
  "package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "apps/native/package.json",
  "apps/desktop/package.json",
  "apps/fumadocs/package.json",
  "apps/docs/package.json",
  "packages/api/package.json",
  "packages/db/package.json",
  "packages/auth/package.json",
  "packages/backend/package.json",
  "packages/config/package.json",
  "packages/env/package.json",
  "packages/infra/package.json",
  "packages/ui/package.json",
];

const ADD_TEXT_FILE_PATHS = [
  "pnpm-workspace.yaml",
  "apps/web/vite.config.ts",
  "apps/web/next.config.ts",
  "apps/web/src/Document.tsx",
  "apps/web/src/root.tsx",
  "apps/web/src/app/layout.tsx",
  "lefthook.yml",
];

const HOOK_ADDONS = ["husky", "lefthook"] as const satisfies readonly Addons[];
const HOOK_LINTER_ADDONS = ["biome", "oxlint", "vite-plus"] as const satisfies readonly Addons[];
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

function isFileExistsError(cause: unknown): boolean {
  return fileExistsErrorSchema.safeParse(cause).success;
}

async function reserveWorkspacePackage(
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

async function addWorkspacePackage(
  vfs: VirtualFileSystem,
  projectDir: string,
  packageName: string,
  packageManager: ProjectConfig["packageManager"],
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

  const typescriptVersionResult = await Result.tryPromise({
    try: async () =>
      rootTypescriptVersionSchema.parse(await fs.readJson(path.join(projectDir, "package.json"))),
    catch: (cause: unknown) =>
      new CLIError({
        message:
          "Cannot determine the TypeScript version. Expected package.json to declare devDependencies.typescript.",
        cause,
      }),
  });
  if (typescriptVersionResult.isErr()) {
    return Result.err(typescriptVersionResult.error);
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

  const packagePath = `packages/${packageName}`;
  vfs.writeFile(
    `${packagePath}/package.json`,
    `${JSON.stringify(
      {
        name: fullPackageName,
        version: "0.0.0",
        private: true,
        type: "module",
        exports: { ".": "./src/index.ts" },
        scripts: { "check-types": "tsc --noEmit" },
        devDependencies: {
          [`${packageScope}/config`]: packageManager === "npm" ? "*" : "workspace:*",
          typescript: typescriptVersionResult.value,
        },
      },
      null,
      2,
    )}\n`,
  );
  vfs.writeFile(
    `${packagePath}/tsconfig.json`,
    `${JSON.stringify(
      {
        extends: `${packageScope}/config/tsconfig.base.json`,
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
  vfs.writeFile(`${packagePath}/src/index.ts`, "export {};\n");

  return Result.ok(undefined);
}

function mergeAddonOptions(
  existingAddonOptions?: AddonOptions,
  nextAddonOptions?: AddonOptions,
): AddonOptions | undefined {
  if (!existingAddonOptions && !nextAddonOptions) {
    return undefined;
  }

  const mergeOption = <T extends object>(existing: T | undefined, next: T | undefined) => {
    if (!existing) return next;
    if (!next) return existing;
    return { ...existing, ...next };
  };

  const mergedAddonOptions: AddonOptions = {
    wxt: mergeOption(existingAddonOptions?.wxt, nextAddonOptions?.wxt),
    fumadocs: mergeOption(existingAddonOptions?.fumadocs, nextAddonOptions?.fumadocs),
    opentui: mergeOption(existingAddonOptions?.opentui, nextAddonOptions?.opentui),
    mcp: mergeOption(existingAddonOptions?.mcp, nextAddonOptions?.mcp),
    skills: mergeOption(existingAddonOptions?.skills, nextAddonOptions?.skills),
    ultracite: mergeOption(existingAddonOptions?.ultracite, nextAddonOptions?.ultracite),
  };

  return Object.values(mergedAddonOptions).some(Boolean) ? mergedAddonOptions : undefined;
}

function getSetupAddons(addonsToAdd: Addons[], updatedAddons: Addons[]): Addons[] {
  const setupAddons = new Set(addonsToAdd);
  const changedHookStack = addonsToAdd.some(
    (addon) =>
      (HOOK_ADDONS as readonly Addons[]).includes(addon) ||
      (HOOK_LINTER_ADDONS as readonly Addons[]).includes(addon),
  );

  if (changedHookStack) {
    // Re-run the existing hook/linter stack so late additions rewrite hook commands together.
    for (const addon of [...HOOK_ADDONS, ...HOOK_LINTER_ADDONS]) {
      if (updatedAddons.includes(addon)) {
        setupAddons.add(addon);
      }
    }
  }

  return [...setupAddons];
}

function shouldRefreshLefthook(addonsToAdd: Addons[], updatedAddons: Addons[]): boolean {
  return (
    updatedAddons.includes("lefthook") &&
    addonsToAdd.some(
      (addon) => addon === "lefthook" || (HOOK_LINTER_ADDONS as readonly Addons[]).includes(addon),
    )
  );
}

function refreshLefthookTemplate(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const template = EMBEDDED_TEMPLATES.get("addons/lefthook/lefthook.yml.hbs");
  if (!template) return;

  vfs.writeFile("lefthook.yml", processTemplateString(template, config));
}

function updateViteConfigImportsForVitePlus(vfs: VirtualFileSystem): void {
  const viteConfigPaths = ["apps/web/vite.config.ts"];

  for (const viteConfigPath of viteConfigPaths) {
    const content = vfs.readFile(viteConfigPath);
    if (!content) continue;

    const updatedContent = content
      .replaceAll('from "vite";', 'from "vite-plus";')
      .replaceAll("from 'vite';", "from 'vite-plus';");

    if (updatedContent !== content) {
      vfs.writeFile(viteConfigPath, updatedContent);
    }
  }
}

export async function addHandler(
  input: AddHandlerInput,
  options: AddHandlerOptions = {},
): Promise<AddResult | undefined> {
  const { silent = false, mode } = options;

  return runWithContextAsync(
    { silent, mode, analyticsDisabled: input.disableAnalytics },
    async () => {
      let result: Awaited<ReturnType<typeof addHandlerInternal>>;
      try {
        result = await addHandlerInternal(input);
      } finally {
        endInterruptibleScope();
      }
      await reportAddOutcome(input, result);

      if (result.isOk()) {
        return result.value;
      }

      const error = result.error;

      if (UserCancelledError.is(error)) {
        if (isSilent()) {
          return {
            success: false,
            addedAddons: [],
            projectDir: "",
            error: error.message,
          };
        }
        return undefined;
      }

      if (isSilent()) {
        return {
          success: false,
          addedAddons: [],
          projectDir: "",
          error: error.message,
        };
      }

      displayError(error);
      process.exit(1);
    },
  );
}

interface ResolveI18nRequestArgs {
  input: AddInput;
  existingLibrary: I18nLibrary | "none";
  compatInput: I18nConfigInput;
  allowPrompt: boolean;
}

async function resolveI18nRequest(
  args: ResolveI18nRequestArgs,
): Promise<
  Result<{ library: I18nLibrary; options: I18nOptions } | undefined, UserCancelledError | CLIError>
> {
  const { input, existingLibrary, compatInput, allowPrompt } = args;

  if (input.i18n !== undefined) {
    if (input.i18n === "none") {
      if (existingLibrary !== "none") {
        return Result.err(
          new CLIError({
            message: `This project already uses ${I18N_LIBRARY_META[existingLibrary].label}. Disabling i18n through \`bts add\` is not supported; set \`i18n\` to "none" in bts.jsonc and remove the generated i18n files manually.`,
          }),
        );
      }
      return Result.ok(undefined);
    }
    return Result.ok({
      library: input.i18n,
      options: I18nOptionsSchema.parse(input.i18nOptions ?? {}),
    });
  }

  if (input.i18nOptions !== undefined) {
    if (existingLibrary === "none") {
      return Result.err(
        new CLIError({
          message: "`i18nOptions` requires `i18n` when the project has no i18n library yet.",
        }),
      );
    }
    return Result.ok({
      library: existingLibrary,
      options: I18nOptionsSchema.parse(input.i18nOptions),
    });
  }

  if (!allowPrompt || existingLibrary !== "none") return Result.ok(undefined);

  const promptResult = await Result.tryPromise({
    try: async () => {
      const library = await getI18nLibraryChoice(undefined, compatInput);
      if (isGoBack(library)) return undefined;
      if (library === "none") return undefined;
      const options = await getI18nOptionsChoice(library, undefined, compatInput);
      if (options === undefined) return undefined;
      if (isGoBack(options)) return undefined;
      return { library, options };
    },
    catch: (cause: unknown) => {
      if (UserCancelledError.is(cause)) return cause;
      return new CLIError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      });
    },
  });

  return promptResult;
}

async function reportAddOutcome(
  input: AddInput,
  result: Result<AddResult, UserCancelledError | CLIError>,
): Promise<void> {
  if (result.isOk()) return;

  const error = result.error;
  if (UserCancelledError.is(error)) return;

  await reportDiagnostic("cli_failed", {
    command: "add",
    mode: resolveInvocationMode(false),
    stage: failureStage(error),
    error: errorClass(error),
    reason: scrubReason(error),
    packageManager: input.packageManager,
  });
}

async function addHandlerInternal(
  input: AddHandlerInput,
): Promise<Result<AddResult, UserCancelledError | CLIError>> {
  const projectDirInput = input.projectDir || process.cwd();
  const hardeningResult = validateAgentSafePathInput(projectDirInput, "projectDir");
  if (hardeningResult.isErr()) {
    return Result.err(
      new CLIError({
        message: hardeningResult.error.message,
        cause: hardeningResult.error,
      }),
    );
  }

  const projectDir = path.resolve(projectDirInput);

  if (!isSilent()) {
    await renderTitle();
    intro(pc.magenta("Add to your project"));
  }

  // Detect existing project configuration
  const existingConfig = await detectProjectConfig(projectDir);

  if (!existingConfig) {
    return Result.err(
      new CLIError({
        message: `No Better-T-Stack project found in "${projectDir}". Make sure bts.jsonc exists.`,
      }),
    );
  }

  if (!isSilent()) {
    log.info(pc.dim(`Detected project: ${existingConfig.projectName}`));
  }

  const existingLibrary: I18nLibrary | "none" = existingConfig.i18n ?? "none";
  const hasI18nFlags = input.i18n !== undefined || input.i18nOptions !== undefined;

  // Determine which addons to add
  let addonsToAdd: Addons[];

  if (input.addons && input.addons.length > 0) {
    // Filter out 'none' and already installed addons
    addonsToAdd = input.addons.filter(
      (addon) => addon !== "none" && !existingConfig.addons.includes(addon),
    );

    if (addonsToAdd.length === 0 && !input.package && !hasI18nFlags) {
      if (!isSilent()) {
        log.warn(pc.yellow("Nothing to add — those addons are already installed"));
        outro(pc.dim("Project unchanged"));
      }
      return Result.ok({
        success: true,
        addedAddons: [],
        projectDir,
      });
    }
  } else if (input.package) {
    addonsToAdd = [];
  } else if (isSilent()) {
    if (!hasI18nFlags) {
      return Result.err(
        new CLIError({
          message: "Addons, a package, or i18n options are required in silent mode.",
        }),
      );
    }
    addonsToAdd = [];
  } else if (hasI18nFlags) {
    addonsToAdd = [];
  } else {
    // Interactive mode - prompt user to select addons
    const promptResult = await Result.tryPromise({
      try: () => getAddonsToAdd(existingConfig),
      catch: (cause: unknown) => {
        if (UserCancelledError.is(cause)) return cause;
        return new CLIError({
          message: cause instanceof Error ? cause.message : String(cause),
          cause: cause,
        });
      },
    });

    if (promptResult.isErr()) {
      return Result.err(promptResult.error);
    }

    addonsToAdd = promptResult.value;
  }

  if (addonsToAdd.includes("axiom")) {
    return Result.err(
      new CLIError({
        message:
          "Axiom must be selected during project creation because it configures Alchemy infrastructure and deployment bindings.",
      }),
    );
  }

  const mergedAddonOptions = mergeAddonOptions(existingConfig.addonOptions, input.addonOptions);
  const compatInput = toI18nConfigInput({
    frontend: existingConfig.frontend,
    backend: existingConfig.backend,
    runtime: existingConfig.runtime,
    auth: existingConfig.auth,
    api: existingConfig.api,
    payments: existingConfig.payments,
    addons: [...existingConfig.addons, ...addonsToAdd],
    addonOptions: mergedAddonOptions,
  });
  const i18nRequestResult = await resolveI18nRequest({
    input,
    existingLibrary,
    compatInput,
    allowPrompt: !isSilent() && !input.package,
  });
  if (i18nRequestResult.isErr()) {
    return Result.err(i18nRequestResult.error);
  }
  const requestedI18n = i18nRequestResult.value;

  if (addonsToAdd.length === 0 && !input.package && requestedI18n === undefined) {
    if (!isSilent()) {
      outro(pc.dim("Nothing selected · project unchanged"));
    }
    return Result.ok({
      success: true,
      addedAddons: [],
      projectDir,
    });
  }

  if (
    requestedI18n !== undefined &&
    existingLibrary !== "none" &&
    requestedI18n.library !== existingLibrary
  ) {
    return Result.err(i18nLibrarySwitchError(existingLibrary, requestedI18n.library));
  }

  // Add-locales (design D9): union the request onto the existing options so
  // `bts add --i18n-locales fr,de` extends the locale set instead of replacing
  // it, and never clobbers sourceLocale/routing/translateSkill.
  const mergedRequestedI18n =
    requestedI18n !== undefined && existingLibrary !== "none"
      ? {
          ...requestedI18n,
          options: mergeAddLocalesOptions(
            existingConfig.i18nOptions,
            requestedI18n.options,
            resolveI18nFlagIntent(input),
          ),
        }
      : requestedI18n;

  // Build config for addon setup
  const updatedAddons = [...existingConfig.addons, ...addonsToAdd];
  const addonsValidationResult = validateAddonsAgainstConfig(updatedAddons, existingConfig);
  if (addonsValidationResult.isErr()) {
    return Result.err(new CLIError({ message: addonsValidationResult.error.message }));
  }

  if (!isSilent()) {
    const additions = [
      addonsToAdd.length > 0 ? formatConfigValue(addonsToAdd) : undefined,
      input.package ? `package ${input.package}` : undefined,
    ].filter(Boolean);
    log.info(`${pc.dim("Adding")} ${pc.cyan(additions.join(" and "))}`);
  }

  const config: ProjectConfig = {
    projectName: existingConfig.projectName,
    projectDir,
    relativePath: ".",
    addonOptions: mergedAddonOptions,
    database: existingConfig.database,
    orm: existingConfig.orm,
    backend: existingConfig.backend,
    runtime: existingConfig.runtime,
    frontend: existingConfig.frontend,
    addons: addonsToAdd, // Only the new addons for template processing
    examples: existingConfig.examples,
    auth: existingConfig.auth,
    payments: existingConfig.payments,
    i18n: mergedRequestedI18n?.library ?? existingConfig.i18n,
    git: false,
    packageManager: input.packageManager || existingConfig.packageManager,
    install: input.install ?? false,
    dbSetup: existingConfig.dbSetup,
    api: existingConfig.api,
    webDeploy: existingConfig.webDeploy,
    serverDeploy: existingConfig.serverDeploy,
  };
  const updatedConfig: ProjectConfig = {
    ...config,
    addons: updatedAddons,
  };

  const i18nConfig: ProjectConfig | undefined =
    mergedRequestedI18n !== undefined
      ? {
          ...updatedConfig,
          i18n: mergedRequestedI18n.library,
          i18nOptions: mergedRequestedI18n.options,
        }
      : undefined;

  if (i18nConfig !== undefined) {
    const i18nValidation = validateI18nConfig(i18nConfig);
    if (i18nValidation.isErr()) {
      return Result.err(i18nValidation.error);
    }
  }

  if (addonsToAdd.length > 0) {
    const requirementsResult = await checkLocalRequirements(updatedConfig);
    if (requirementsResult.isErr()) {
      return Result.err(requirementsResult.error);
    }
    if (!isSilent()) {
      for (const warning of requirementsResult.value.warnings) {
        log.warn(pc.yellow(warning));
      }
    }
  }

  // Create VFS and process addon templates using template-generator's logic
  if (!isSilent()) {
    log.info(pc.dim("Preparing files…"));
  }

  const vfs = new VirtualFileSystem();

  if (input.package) {
    const packageResult = await addWorkspacePackage(
      vfs,
      projectDir,
      input.package,
      existingConfig.packageManager,
    );
    if (packageResult.isErr()) {
      return Result.err(packageResult.error);
    }
  }

  if (addonsToAdd.length > 0) {
    // Pre-load existing files into VFS so addon processors can modify them.
    for (const pkgPath of ADD_PACKAGE_JSON_PATHS) {
      const fullPath = path.join(projectDir, pkgPath);
      if (await fs.pathExists(fullPath)) {
        const content = await fs.readFile(fullPath, "utf-8");
        vfs.writeFile(pkgPath, content);
      }
    }
    for (const filePath of ADD_TEXT_FILE_PATHS) {
      const fullPath = path.join(projectDir, filePath);
      if (await fs.pathExists(fullPath)) {
        const content = await fs.readFile(fullPath, "utf-8");
        vfs.writeFile(filePath, content);
      }
    }

    // Process addon templates and dependencies using template-generator's logic.
    await processAddonTemplates(vfs, EMBEDDED_TEMPLATES, config);
    processAddonsDeps(vfs, config);
    processPwaPlugins(vfs, config);
    processPnpmWorkspaceConfig(vfs, updatedConfig);
    processNpmScriptApprovals(vfs, updatedConfig);

    if (addonsToAdd.includes("turborepo")) {
      processTurboConfig(vfs, updatedConfig);
    }

    if (addonsToAdd.includes("nx")) {
      processNxConfig(vfs, updatedConfig);
    }

    if (addonsToAdd.includes("vite-plus")) {
      processVitePlusConfig(vfs, updatedConfig);
    }

    const hasTaskRunner = updatedAddons.some((addon) =>
      (TASK_RUNNER_ADDONS as readonly Addons[]).includes(addon),
    );

    if (hasTaskRunner || addonsToAdd.includes("electrobun")) {
      const existingNames = new Map(
        ADD_PACKAGE_JSON_PATHS.map((filePath) => [
          filePath,
          vfs.readJson<{ name?: string }>(filePath)?.name,
        ]),
      );
      processPackageConfigs(vfs, updatedConfig);
      for (const [filePath, name] of existingNames) {
        if (name) {
          const pkg = vfs.readJson<{ name: string }>(filePath);
          if (pkg) vfs.writeJson(filePath, { ...pkg, name });
        }
      }
    }

    if (updatedAddons.includes("vite-plus")) {
      updateViteConfigImportsForVitePlus(vfs);
    }

    if (shouldRefreshLefthook(addonsToAdd, updatedAddons)) {
      refreshLefthookTemplate(vfs, updatedConfig);
    }
  }

  // Write VFS to disk
  const tree = {
    root: vfs.toTree(""),
    fileCount: vfs.getFileCount(),
    directoryCount: vfs.getDirectoryCount(),
    config: updatedConfig,
  };

  if (input.dryRun) {
    let i18nPlanned = 0;
    if (i18nConfig !== undefined) {
      const dryResult = await runI18nRetrofit({
        projectDir,
        config: i18nConfig,
        existingLibrary,
        existingOptions: existingConfig.i18nOptions,
        dryRun: true,
      });
      if (dryResult.isErr()) return Result.err(dryResult.error);
      i18nPlanned = dryResult.value.summary.created + dryResult.value.summary.edited;
      if (!isSilent()) {
        for (const line of renderPlan(dryResult.value.plan)) log.message(pc.dim(line));
      }
    }

    if (!isSilent()) {
      log.success(pc.green("Dry run passed · no files written"));
      log.message(pc.dim(`${vfs.getFileCount() + i18nPlanned} files planned`));
      outro(pc.dim("Project unchanged"));
    }

    return Result.ok({
      success: true,
      addedAddons: addonsToAdd,
      projectDir,
      dryRun: true,
      plannedFileCount: vfs.getFileCount() + i18nPlanned,
      addedPackage: input.package,
    });
  }

  let reservedPackageDir: string | undefined;
  if (input.package) {
    const reservationResult = await reserveWorkspacePackage(projectDir, input.package);
    if (reservationResult.isErr()) {
      return Result.err(reservationResult.error);
    }
    reservedPackageDir = reservationResult.value;
  }

  const writeResult = await writeTree(tree, projectDir);

  if (writeResult.isErr()) {
    if (reservedPackageDir && input.package) {
      const cleanupResult = await Result.tryPromise({
        try: () => fs.remove(reservedPackageDir),
        catch: (cause: unknown) =>
          new CLIError({
            message: `Failed to clean up incomplete workspace package: packages/${input.package}`,
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
    }

    return Result.err(
      new CLIError({
        message: `Failed to write files: ${writeResult.error.message}`,
      }),
    );
  }

  if (vfs.getFileCount() > 0 && !isSilent()) {
    log.info(pc.dim(`Wrote ${vfs.getFileCount()} files`));
  }

  // Files are on disk from here: Ctrl-C only stops the current step
  beginInterruptibleScope();

  // Run addon setup (handles deps and interactive prompts)
  // Wrap with Result.tryPromise since setupAddons can throw UserCancelledError
  const setupResult = await Result.tryPromise({
    try: async () => {
      if (addonsToAdd.length > 0) {
        await setupAddons({
          ...config,
          addons: getSetupAddons(addonsToAdd, updatedAddons),
        });
      }
    },
    catch: (cause: unknown) => {
      if (UserCancelledError.is(cause)) return cause;
      return new CLIError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause: cause,
      });
    },
  });

  if (setupResult.isErr()) {
    return Result.err(setupResult.error);
  }

  let i18nResult: RetrofitResult | undefined;
  if (i18nConfig !== undefined && mergedRequestedI18n !== undefined) {
    const retrofit = await runI18nRetrofit({
      projectDir,
      config: i18nConfig,
      existingLibrary,
      existingOptions: existingConfig.i18nOptions,
      dryRun: false,
    });
    if (retrofit.isErr()) {
      return Result.err(retrofit.error);
    }
    i18nResult = retrofit.value;

    const i18nBtsResult = await writeI18nToBtsConfig(
      projectDir,
      mergedRequestedI18n.library,
      mergedRequestedI18n.options,
    );
    if (i18nBtsResult.isErr()) {
      return Result.err(i18nBtsResult.error);
    }
  }

  // Update bts.jsonc with new addons
  if (addonsToAdd.length > 0) {
    const configResult = await updateBtsConfig(projectDir, {
      addons: updatedAddons,
      addonOptions: updatedConfig.addonOptions,
    });
    if (configResult.isErr()) return Result.err(configResult.error);
  }

  // Install dependencies if requested
  if (input.install) {
    await installDependencies({ projectDir, packageManager: config.packageManager });
  }

  if (!isSilent()) {
    const additions = [
      addonsToAdd.length > 0 ? formatConfigValue(addonsToAdd) : undefined,
      input.package ? `package ${input.package}` : undefined,
      mergedRequestedI18n !== undefined
        ? `i18n (${I18N_LIBRARY_META[mergedRequestedI18n.library].label})`
        : undefined,
    ].filter(Boolean);
    log.success(pc.green(`Added ${additions.join(" and ")}`));

    if (i18nResult !== undefined && i18nResult.summary.manual > 0) {
      log.message(
        pc.yellow(`${i18nResult.summary.manual} manual step(s) required — see I18N_SETUP.md`),
      );
    }

    if (mergedRequestedI18n !== undefined) {
      log.message(
        `${pc.dim("Next")} ${pc.cyan("Run the i18n-adopt skill to wrap your existing strings")}`,
      );
    }

    if (!input.install) {
      const installCommand =
        config.packageManager === "npm" ? "npm install" : `${config.packageManager} install`;
      log.message(`${pc.dim("Next step")}\n${pc.cyan(installCommand)}`);
    }

    outro(pc.magenta("Project updated"));
  }

  return Result.ok({
    success: true,
    addedAddons: addonsToAdd,
    projectDir,
    plannedFileCount: vfs.getFileCount(),
    addedPackage: input.package,
  });
}
