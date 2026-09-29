// Stage a preview build of the CLI as `@wundero/bts` for the `next` channel.
//
// Usage: bun run scripts/preview-publish.ts --out <dir>
// Version: <base>-preview-<YYYYMMDD>-<shortSha> (override with PREVIEW_DATE /
// SHORT_SHA / GITHUB_SHA). Emits `version=<v>` to $GITHUB_OUTPUT when present.

import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type PreviewEnvironment,
  readCliBaseVersion,
  resolvePreviewVersion,
  stagePreviewPackage,
} from "./preview-publish-lib";

function parseOutDir(args: readonly string[]): string {
  const index = args.indexOf("--out");
  if (index === -1) return resolve(process.cwd(), ".preview-package");
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("`--out` requires a target directory.");
  }
  return resolve(process.cwd(), value);
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const sourceDir = resolve(process.cwd(), "apps/cli");

  const environment: PreviewEnvironment = {
    PREVIEW_DATE: process.env.PREVIEW_DATE,
    SHORT_SHA: process.env.SHORT_SHA,
    GITHUB_SHA: process.env.GITHUB_SHA,
  };

  const baseVersion = await readCliBaseVersion(sourceDir);
  const version = resolvePreviewVersion(baseVersion, environment);
  const staged = await stagePreviewPackage({
    sourceDir,
    outDir,
    version,
    dependencyVersion: baseVersion,
  });

  const output = process.env.GITHUB_OUTPUT;
  if (output !== undefined) {
    await appendFile(output, `version=${version}\n`, "utf-8");
  }

  console.log(`Staged ${staged.name}@${staged.version}`);
  console.log(`Base version: ${baseVersion}`);
  console.log(`Output directory: ${outDir}`);
  console.log(`Expected tarball: wundero-bts-${version}.tgz`);
  console.log(`PREVIEW_VERSION=${version}`);
}

main().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
