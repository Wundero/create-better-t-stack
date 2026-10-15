import {
  EMBEDDED_TEMPLATES,
  processI18nDeps,
  processI18nTemplates,
  processNxConfig,
  processPackageConfigs,
  processTurboConfig,
  processVitePlusConfig,
} from "@better-t-stack/template-generator";
import { Result } from "better-result";

import {
  type I18nLibrary,
  type I18nOptions,
  I18nOptionsSchema,
  type I18nSurface,
  getI18nSurfaces,
  type ProjectConfig,
} from "../../../types";
import { CLIError } from "../../../utils/errors";
import { loadProjectTextFiles } from "./project-files";
import { RetrofitVirtualFileSystem, type RetrofitWrite } from "./retrofit-vfs";
import type { RetrofitEdit, RetrofitPlan, RetrofitSkipped } from "./types";

const STRUCTURED_FILES = new Set(["package.json", "bunfig.toml", "tsconfig.json"]);
const CONFIG_FILE_PATTERN =
  /(^|\/)(vite|nuxt|astro|next|metro|svelte|wxt|app)\.config\.[cm]?[jt]s$|(^|\/)(biome|lingui|i18next|wuchale)\.config\.[cm]?[jt]s$|(^|\/)biome\.json$/;

/**
 * Root/provider files the create-path patches per surface. A file here that is
 * read during the patch phase but left unchanged means its anchor was missing
 * or appeared more than once, so the Add Path reports a manual step instead of
 * editing the wrong place.
 */
const REQUIRED_ROOT_FILES = new Map<I18nSurface, readonly string[]>([
  ["next", ["apps/web/src/components/providers.tsx"]],
  ["tanstack-start", ["apps/web/src/routes/__root.tsx"]],
  ["tanstack-router", ["apps/web/src/routes/__root.tsx"]],
  ["react-router", ["apps/web/src/root.tsx"]],
  ["solid", ["apps/web/src/App.tsx"]],
  ["nuxt", ["apps/web/app/app.vue"]],
  ["svelte", ["apps/web/src/routes/+layout.svelte"]],
  ["astro", ["apps/web/src/layouts/Layout.astro"]],
  ["native", ["apps/native/app/_layout.tsx"]],
  ["server", ["apps/server/src/index.ts"]],
]);

function isStructuredFile(filePath: string): boolean {
  const basename = filePath.split("/").pop() ?? filePath;
  return STRUCTURED_FILES.has(basename) || CONFIG_FILE_PATTERN.test(filePath);
}

function classifyWrite(write: RetrofitWrite): RetrofitEdit | RetrofitSkipped {
  if (write.previous === undefined) {
    return {
      kind: "create",
      path: write.path,
      description: `Create ${write.path}`,
      content: write.content,
    };
  }

  if (write.previous === write.content) {
    return { path: write.path, reason: "Already up to date" };
  }

  if (write.phases.has("create")) {
    return {
      kind: "manual",
      path: write.path,
      description: `Existing file kept — the Add Path would otherwise overwrite ${write.path}.`,
      snippet: write.content,
    };
  }

  return {
    kind: isStructuredFile(write.path) ? "config-edit" : "anchored-insert",
    path: write.path,
    description: `${isStructuredFile(write.path) ? "Update" : "Insert into"} ${write.path}`,
    content: write.content,
  };
}

function manualSnippet(filePath: string, library: I18nLibrary): string {
  if (filePath === "apps/web/src/components/providers.tsx" && library === "lingui") {
    return [
      'import { I18nProvider } from "@/components/i18n-provider";',
      "",
      "<I18nProvider>",
      "  {/* existing ThemeProvider subtree */}",
      "</I18nProvider>",
    ].join("\n");
  }
  return [
    `# ${filePath}`,
    `# Apply the ${library} surface glue by hand:`,
    "# 1. import the provider/runtime emitted under packages/i18n (see the i18n-adopt skill).",
    "# 2. wrap the app root/provider element exactly once.",
    `# Anchor not found uniquely — see packages/i18n and \`i18n-adopt\` for the exact shape.`,
  ].join("\n");
}

function buildManualEdits(
  vfs: RetrofitVirtualFileSystem,
  surfaces: readonly I18nSurface[],
  library: I18nLibrary,
  changedPaths: ReadonlySet<string>,
): RetrofitEdit[] {
  const edits: RetrofitEdit[] = [];

  for (const blocked of vfs.getBlockedDeletions()) {
    edits.push({
      kind: "manual",
      path: blocked,
      description: `Existing file kept — the Add Path never deletes ${blocked}.`,
    });
  }

  for (const surface of surfaces) {
    for (const filePath of REQUIRED_ROOT_FILES.get(surface) ?? []) {
      if (!vfs.existsOnDisk(filePath)) continue;
      if (!vfs.wasReadDuringEdit(filePath)) continue;
      if (changedPaths.has(filePath)) continue;
      if (edits.some((edit) => edit.path === filePath)) continue;
      edits.push({
        kind: "manual",
        path: filePath,
        description: `Required anchor missing or ambiguous in ${filePath}; left unmodified.`,
        snippet: manualSnippet(filePath, library),
      });
    }
  }

  return edits;
}

function planFromVfs(
  vfs: RetrofitVirtualFileSystem,
  library: I18nLibrary,
  options: I18nOptions,
  surfaces: readonly I18nSurface[],
): RetrofitPlan {
  const edits: RetrofitEdit[] = [];
  const skipped: RetrofitSkipped[] = [];
  const changedPaths = new Set<string>();

  for (const write of vfs.getWrites()) {
    const classified = classifyWrite(write);
    if ("reason" in classified) {
      skipped.push(classified);
      continue;
    }
    edits.push(classified);
    changedPaths.add(classified.path);
  }

  edits.push(...buildManualEdits(vfs, surfaces, library, changedPaths));

  return { mode: "install", library, options, edits, skipped };
}

export interface InstallPlanInput {
  projectDir: string;
  config: ProjectConfig;
}

export async function buildInstallPlan(
  input: InstallPlanInput,
): Promise<Result<RetrofitPlan, CLIError>> {
  const library = input.config.i18n;
  if (library === undefined || library === "none") {
    return Result.err(
      new CLIError({ message: "buildInstallPlan requires a selected i18n library." }),
    );
  }

  return Result.tryPromise({
    try: async () => {
      const files = await loadProjectTextFiles(input.projectDir);
      const vfs = new RetrofitVirtualFileSystem();
      vfs.seed(files);

      vfs.phase = "create";
      await processI18nTemplates(vfs, EMBEDDED_TEMPLATES, input.config);

      vfs.phase = "edit";
      processI18nDeps(vfs, input.config);
      // Root `i18n:*` scripts and the task-runner wiring are owned by the
      // package-config and task-runner processors, exactly as on the create path.
      processPackageConfigs(vfs, input.config);
      if (input.config.addons.includes("turborepo")) processTurboConfig(vfs, input.config);
      if (input.config.addons.includes("nx")) processNxConfig(vfs, input.config);
      if (input.config.addons.includes("vite-plus")) processVitePlusConfig(vfs, input.config);

      return planFromVfs(
        vfs,
        library,
        I18nOptionsSchema.parse(input.config.i18nOptions ?? {}),
        getI18nSurfaces(input.config),
      );
    },
    catch: (cause: unknown) =>
      new CLIError({
        message: `Failed to plan the i18n retrofit: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}
