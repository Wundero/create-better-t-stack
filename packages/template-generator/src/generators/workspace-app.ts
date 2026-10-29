import type { Backend, Frontend, ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../core/virtual-fs";
import { processCatalogs } from "../post-process/catalogs";
import { processEnvDeps } from "../processors/env-deps";
import { processVarlock } from "../processors/varlock";
import { processWorkspaceDeps } from "../processors/workspace-deps";
import { processAddonTemplates } from "../template-handlers/addons";
import { processApiTemplates } from "../template-handlers/api";
import { processBackendTemplates } from "../template-handlers/backend";
import { processFrontendTemplates } from "../template-handlers/frontend";
import { extractAndRenameSubtree } from "./extract-subtree";
import type { RootPackageJson } from "./workspace-package";

export type WorkspaceAppKind = "frontend" | "backend" | "mobile";

/** Directory the existing handlers always generate into for each app kind. */
const CANONICAL_APP_PATH = {
  frontend: "apps/web",
  mobile: "apps/native",
  backend: "apps/server",
} satisfies Record<WorkspaceAppKind, string>;

/** Root files handlers may mutate; only catalog changes may be persisted from them. */
const ROOT_CATALOG_FILES = ["package.json", "pnpm-workspace.yaml"] as const;

export interface PlanWorkspaceAppInput {
  /** Base project config: projectName is the package scope, plus api/auth/db/backend/addons. */
  config: ProjectConfig;
  kind: WorkspaceAppKind;
  /** App name used for both `apps/<name>` and the bare package.json name. */
  name: string;
  /** Required when kind is "frontend" or "mobile". */
  frontend?: Frontend;
  /** Required when kind is "backend". */
  backend?: Backend;
  /** Preloaded EXISTING project files (packages/*, root package.json, pnpm-workspace.yaml). */
  existingFiles: Map<string, string>;
  /** Embedded Handlebars templates. */
  templates: Map<string, string>;
}

export interface PlanWorkspaceAppResult {
  /** Final destination paths (apps/<name>/...) mapped to file content. */
  files: Map<string, string>;
  /** Changed root-level files to persist: package.json and/or pnpm-workspace.yaml. */
  rootFiles: Map<string, string>;
  /** Env generation target, only when the app was wired into the root scripts. */
  envGeneratePath?: string;
  warnings: string[];
}

/** Appends `command` unless the existing script already contains it. */
function appendCommand(existing: string | undefined, command: string): string {
  if (existing?.includes(command)) return existing;
  return [existing, command].filter((part): part is string => Boolean(part)).join(" && ");
}

function buildTempConfig(input: PlanWorkspaceAppInput): ProjectConfig {
  const base: ProjectConfig = { ...input.config, git: false, install: false };

  if (input.kind === "backend") {
    if (input.backend === undefined) {
      throw new Error('`backend` is required when `kind` is "backend"');
    }
    return { ...base, frontend: [], backend: input.backend };
  }

  if (input.frontend === undefined) {
    throw new Error(`\`frontend\` is required when \`kind\` is "${input.kind}"`);
  }
  return { ...base, frontend: [input.frontend] };
}

/**
 * Plans a single new app inside an existing monorepo. Reuses the canonical app
 * template handlers, then extracts and renames the generated subtree to
 * `apps/<name>`. Pure: all work happens in-memory on a VirtualFileSystem.
 */
export function planWorkspaceApp(input: PlanWorkspaceAppInput): PlanWorkspaceAppResult {
  const { existingFiles, templates } = input;
  const vfs = new VirtualFileSystem();

  for (const [path, content] of existingFiles) {
    vfs.writeFile(path, content);
  }

  const config = buildTempConfig(input);

  // Handlers are declared async but perform entirely synchronous work, so the
  // voided calls complete before the extraction below reads the VFS.
  if (input.kind === "frontend" || input.kind === "mobile") {
    void processFrontendTemplates(vfs, templates, config);
  } else {
    void processBackendTemplates(vfs, templates, config);
  }
  void processApiTemplates(vfs, templates, config);
  void processAddonTemplates(vfs, templates, config);
  processWorkspaceDeps(vfs, config);
  // Declare varlock (and the framework integration) on the generated app before
  // processVarlock wires its scripts, mirroring the full-generator deps order.
  processEnvDeps(vfs, config);
  processVarlock(vfs, templates, config);

  // Handlers mutate root files for a full scaffold (varlock scripts, workspace
  // deps) using only the apps in this plan. Those mutations are invalid for
  // incremental generation, so discard them; only the catalog step and the new
  // app's env wiring below may persist root changes.
  for (const path of ROOT_CATALOG_FILES) {
    const original = existingFiles.get(path);
    if (original !== undefined) {
      vfs.writeFile(path, original);
    }
  }

  const canonicalPath = CANONICAL_APP_PATH[input.kind];
  processCatalogs(vfs, config, [canonicalPath]);

  const files = extractAndRenameSubtree(vfs, canonicalPath, `apps/${input.name}`, input.name);

  const warnings: string[] = [];
  let envGeneratePath: string | undefined;

  if (files.has(`apps/${input.name}/.env.schema`)) {
    const command = `varlock codegen --path ./apps/${input.name}/`;
    const rootPackageJson = vfs.readJson<RootPackageJson>("package.json");
    const hasVarlockDependency =
      rootPackageJson?.dependencies?.varlock !== undefined ||
      rootPackageJson?.devDependencies?.varlock !== undefined;
    const rootScripts = rootPackageJson?.scripts;
    const envGenerate = rootScripts?.["env:generate"];
    const postinstall = rootScripts?.postinstall;

    if (
      hasVarlockDependency &&
      rootPackageJson !== undefined &&
      (envGenerate !== undefined || postinstall !== undefined)
    ) {
      rootPackageJson.scripts = {
        ...rootScripts,
        "env:generate": appendCommand(envGenerate, command),
        postinstall: appendCommand(postinstall, command),
      };
      vfs.writeJson("package.json", rootPackageJson);
      envGeneratePath = `apps/${input.name}`;
    } else {
      warnings.push(
        `This project is not wired for varlock env codegen; run "varlock codegen --path ./apps/${input.name}/" (or "${config.packageManager} run env:generate" in apps/${input.name}) to generate env types.`,
      );
    }
  }

  const rootFiles = new Map<string, string>();
  for (const path of ROOT_CATALOG_FILES) {
    const current = vfs.readFile(path);
    if (current === undefined) continue;
    const previous = existingFiles.get(path);
    if (previous === undefined || previous.trimEnd() !== current.trimEnd()) {
      rootFiles.set(path, current);
    }
  }

  const result: PlanWorkspaceAppResult = { files, rootFiles, warnings };
  if (envGeneratePath !== undefined) {
    result.envGeneratePath = envGeneratePath;
  }
  return result;
}
