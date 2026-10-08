// Preview publish helpers for shipping the CLI as `@wundero/bts` from `next`.
//
// The version scheme is `<base>-preview-<YYYYMMDD>-<shortSha>` and every
// function here is deterministic given its inputs so CI and local runs agree.

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PREVIEW_PACKAGE_NAME = "@wundero/bts";

const SHORT_SHA_LENGTH = 7;
const SEMVER_CORE = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)`;
const BASE_VERSION_PATTERN = new RegExp(`^(${SEMVER_CORE})`);
const DATE_PATTERN = /^(\d{4})-?(\d{2})-?(\d{2})$/;
const SHA_PATTERN = /^[0-9a-f]{7,40}$/;
const PREVIEW_VERSION_PATTERN = new RegExp(
  `^${SEMVER_CORE}-preview-\\d{8}-[0-9a-f]{${SHORT_SHA_LENGTH}}$`,
);

const WORKSPACE_PROTOCOL_PATTERN = /^(?:workspace:|catalog:)/;
const PREVIEW_REPOSITORY_URL = "git+https://github.com/Wundero/create-better-t-stack.git";

export interface PreviewVersionParams {
  readonly baseVersion: string;
  readonly date: string;
  readonly sha: string;
}

export interface PreviewEnvironment {
  readonly PREVIEW_DATE?: string;
  readonly SHORT_SHA?: string;
  readonly GITHUB_SHA?: string;
}

export interface WorkspacePackageSource {
  readonly name: string;
  readonly sourceDir: string;
}

export interface StagePreviewPackageOptions {
  readonly sourceDir: string;
  readonly outDir: string;
  readonly version: string;
  readonly dependencyVersion: string;
  readonly readmePath?: string;
  readonly workspacePackages?: readonly WorkspacePackageSource[];
}

export interface StagedPreviewPackage {
  readonly name: string;
  readonly version: string;
}

interface PreviewPackageManifest {
  name: string;
  version: string;
  bin?: Record<string, string>;
  files?: string[];
  type?: string;
  exports?: unknown;
  main?: string;
  module?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  bundleDependencies?: string[];
  publishConfig?: { access: string };
  repository?: { type: string; url: string; directory?: string };
}

// `templates-binary` must sit beside `dist/` because fs-writer resolves it from its own module dir.
const WORKSPACE_PACKAGE_COPY_ENTRIES = ["dist", "templates-binary"] as const;

/** Reduce any package version to its `x.y.z` core, rejecting unparseable input. */
export function normalizeBaseVersion(rawVersion: string): string {
  const match = BASE_VERSION_PATTERN.exec(rawVersion.trim());
  const base = match?.[1];
  if (base === undefined) {
    throw new Error(`Cannot derive a base version from \`${rawVersion}\`.`);
  }
  return base;
}

/** Normalize a date to `YYYYMMDD`, accepting either `YYYY-MM-DD` or `YYYYMMDD`. */
export function normalizePreviewDate(rawDate: string): string {
  const match = DATE_PATTERN.exec(rawDate.trim());
  if (match === null) {
    throw new Error(`Preview date must be YYYYMMDD or YYYY-MM-DD (received \`${rawDate}\`).`);
  }
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Preview date must be YYYYMMDD or YYYY-MM-DD (received \`${rawDate}\`).`);
  }
  return `${year}${month}${day}`;
}

/** Normalize a commit sha to its 7 character lowercase short form. */
export function normalizeSha(rawSha: string): string {
  const sha = rawSha.trim().toLowerCase();
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`Commit sha must be 7-40 hexadecimal characters (received \`${rawSha}\`).`);
  }
  return sha.slice(0, SHORT_SHA_LENGTH);
}

export function buildPreviewVersion(params: PreviewVersionParams): string {
  const base = normalizeBaseVersion(params.baseVersion);
  const date = normalizePreviewDate(params.date);
  const sha = normalizeSha(params.sha);
  const version = `${base}-preview-${date}-${sha}`;
  if (!isValidPreviewVersion(version)) {
    throw new Error(`Computed preview version \`${version}\` is not a valid semver prerelease.`);
  }
  return version;
}

/** Confirm a string is a valid `x.y.z-preview-YYYYMMDD-sha` npm prerelease. */
export function isValidPreviewVersion(version: string): boolean {
  return PREVIEW_VERSION_PATTERN.test(version.trim());
}

/** Resolve the preview version from CI env overrides, preferring explicit values. */
export function resolvePreviewVersion(
  baseVersion: string,
  environment: PreviewEnvironment,
  now: Date = new Date(),
): string {
  const date = environment.PREVIEW_DATE ?? formatPreviewDate(now);
  const sha = environment.SHORT_SHA ?? environment.GITHUB_SHA;
  if (sha === undefined || sha.trim() === "") {
    throw new Error("Set SHORT_SHA or GITHUB_SHA so the preview version is unique per commit.");
  }
  return buildPreviewVersion({ baseVersion, date, sha });
}

export function formatPreviewDate(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** Replace `workspace:`/`catalog:` dependency protocols with concrete caret ranges. */
export function rewriteWorkspaceDependencies(
  dependencies: Record<string, string>,
  version: string,
) {
  const rewritten: Record<string, string> = {};
  for (const [name, range] of Object.entries(dependencies)) {
    rewritten[name] = WORKSPACE_PROTOCOL_PATTERN.test(range) ? `^${version}` : range;
  }
  return rewritten;
}

export async function readCliBaseVersion(sourceDir: string): Promise<string> {
  const manifest = await readManifest(sourceDir);
  return normalizeBaseVersion(manifest.version);
}

function rewriteRepository(repository: PreviewPackageManifest["repository"]) {
  if (repository === undefined) return undefined;
  return { type: "git", url: PREVIEW_REPOSITORY_URL, directory: "apps/cli" };
}

async function readManifest(sourceDir: string): Promise<PreviewPackageManifest> {
  const raw = await readFile(join(sourceDir, "package.json"), "utf-8");
  return JSON.parse(raw) as PreviewPackageManifest;
}

async function stageWorkspacePackage(
  source: WorkspacePackageSource,
  outDir: string,
): Promise<Record<string, string>> {
  const manifest = await readManifest(source.sourceDir);
  const targetDir = join(outDir, "node_modules", source.name);
  await mkdir(targetDir, { recursive: true });

  for (const entry of WORKSPACE_PACKAGE_COPY_ENTRIES) {
    const entrySource = join(source.sourceDir, entry);
    if (!existsSync(entrySource)) continue;
    await cp(entrySource, join(targetDir, entry), { recursive: true });
  }

  const nested: PreviewPackageManifest = {
    ...manifest,
    dependencies: rewriteWorkspaceDependencies(manifest.dependencies ?? {}, manifest.version),
  };
  delete nested.scripts;
  delete nested.devDependencies;
  delete nested.publishConfig;
  delete nested.repository;

  await writeFile(join(targetDir, "package.json"), `${JSON.stringify(nested, null, 2)}\n`, "utf-8");
  return nested.dependencies ?? {};
}

/**
 * Copy the CLI manifest + built `dist/` into `outDir`, rewriting the package
 * identity to the preview scope and resolving workspace deps to concrete
 * versions so the tarball installs standalone. Bundled workspace packages are
 * copied into the tarball's `node_modules` so the preview ships `next`'s
 * versions instead of the divergent stable ones on npm.
 */
export async function stagePreviewPackage(
  options: StagePreviewPackageOptions,
): Promise<StagedPreviewPackage> {
  const manifest = await readManifest(options.sourceDir);
  const workspacePackages = options.workspacePackages ?? [];
  const dependencies = rewriteWorkspaceDependencies(
    manifest.dependencies ?? {},
    options.dependencyVersion,
  );

  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(options.outDir, { recursive: true });
  await cp(join(options.sourceDir, "dist"), join(options.outDir, "dist"), { recursive: true });

  for (const workspacePackage of workspacePackages) {
    const nestedDependencies = await stageWorkspacePackage(workspacePackage, options.outDir);
    for (const [name, range] of Object.entries(nestedDependencies)) {
      dependencies[name] ??= range;
    }
  }

  const staged: PreviewPackageManifest = {
    ...manifest,
    name: PREVIEW_PACKAGE_NAME,
    version: options.version,
    publishConfig: { access: "public" },
    repository: rewriteRepository(manifest.repository),
    dependencies,
  };
  delete staged.scripts;
  delete staged.devDependencies;
  if (workspacePackages.length > 0) {
    staged.bundleDependencies = workspacePackages.map((workspacePackage) => workspacePackage.name);
  }

  if (options.readmePath !== undefined) {
    await cp(options.readmePath, join(options.outDir, "README.md"));
  }
  await writeFile(
    join(options.outDir, "package.json"),
    `${JSON.stringify(staged, null, 2)}\n`,
    "utf-8",
  );

  return { name: staged.name, version: staged.version };
}
