import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildPreviewVersion,
  isValidPreviewVersion,
  normalizeBaseVersion,
  normalizePreviewDate,
  normalizeSha,
  PREVIEW_PACKAGE_NAME,
  readCliBaseVersion,
  resolvePreviewVersion,
  rewriteWorkspaceDependencies,
  stagePreviewPackage,
} from "./preview-publish-lib";

const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "bts-preview-publish-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeCliFixture(sourceDir: string): void {
  writeFileSync(
    join(sourceDir, "package.json"),
    `${JSON.stringify(
      {
        name: "create-better-t-stack",
        version: "3.44.1",
        bin: { "create-better-t-stack": "dist/cli.mjs" },
        files: ["dist"],
        exports: { ".": { import: "./dist/index.mjs" }, "./cli": { import: "./dist/cli.mjs" } },
        scripts: { build: "tsdown --publint", prepublishOnly: "npm run build" },
        dependencies: {
          "@better-t-stack/template-generator": "workspace:*",
          "@better-t-stack/types": "workspace:*",
          semver: "^7.8.5",
        },
        devDependencies: { tsdown: "catalog:" },
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(join(sourceDir, "dist"));
  writeFileSync(join(sourceDir, "dist", "cli.mjs"), "#!/usr/bin/env node\nconsole.log('bts');\n");
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
});

describe("buildPreviewVersion", () => {
  test("formats base version with preview date and short sha", () => {
    const version = buildPreviewVersion({
      baseVersion: "3.44.1",
      date: "20260929",
      sha: "abc1234def5678",
    });

    expect(version).toBe("3.44.1-preview-20260929-abc1234");
    expect(isValidPreviewVersion(version)).toBe(true);
  });

  test("strips an existing prerelease from the base version", () => {
    expect(normalizeBaseVersion("3.44.1-canary.abc1234")).toBe("3.44.1");
    expect(normalizeBaseVersion("3.44.1-preview-20260929-abc1234")).toBe("3.44.1");
  });

  test("accepts a dashed date and normalizes it", () => {
    expect(normalizePreviewDate("2026-09-29")).toBe("20260929");
  });

  test("is unique per commit and per date", () => {
    const first = buildPreviewVersion({ baseVersion: "3.44.1", date: "20260929", sha: "aaaaaaa" });
    const second = buildPreviewVersion({
      baseVersion: "3.44.1",
      date: "20260929",
      sha: "bbbbbbb",
    });
    const nextDay = buildPreviewVersion({
      baseVersion: "3.44.1",
      date: "20260930",
      sha: "aaaaaaa",
    });

    expect(first).not.toBe(second);
    expect(first).not.toBe(nextDay);
  });

  test("rejects malformed base versions, dates, and shas", () => {
    expect(() => normalizeBaseVersion("not-a-version")).toThrow();
    expect(() => normalizeBaseVersion("03.4.1")).toThrow();
    expect(() => normalizePreviewDate("2026-9-9")).toThrow();
    expect(() => normalizeSha("zzzzzzz")).toThrow();
    expect(isValidPreviewVersion("3.44.1-preview-20260929-abc1234")).toBe(true);
    expect(isValidPreviewVersion("3.44.1")).toBe(false);
  });
});

describe("resolvePreviewVersion", () => {
  test("prefers explicit env overrides over the current time", () => {
    const version = resolvePreviewVersion("3.44.1", {
      PREVIEW_DATE: "20260101",
      SHORT_SHA: "deadbeef",
    });

    expect(version).toBe("3.44.1-preview-20260101-deadbee");
  });

  test("falls back to GITHUB_SHA and rejects a missing sha", () => {
    const version = resolvePreviewVersion("3.44.1", {
      PREVIEW_DATE: "20260101",
      GITHUB_SHA: "cafebabecafebabe",
    });

    expect(version).toBe("3.44.1-preview-20260101-cafebab");

    expect(() => resolvePreviewVersion("3.44.1", { PREVIEW_DATE: "20260101" })).toThrow();
  });
});

describe("rewriteWorkspaceDependencies", () => {
  test("rewrites workspace and catalog protocols to caret versions", () => {
    expect(
      rewriteWorkspaceDependencies(
        {
          "@better-t-stack/types": "workspace:*",
          "@better-t-stack/template-generator": "catalog:",
          semver: "^7.8.5",
        },
        "3.44.1",
      ),
    ).toEqual({
      "@better-t-stack/types": "^3.44.1",
      "@better-t-stack/template-generator": "^3.44.1",
      semver: "^7.8.5",
    });
  });
});

describe("stagePreviewPackage", () => {
  test("writes a publishable @wundero/bts manifest next to the built dist", async () => {
    const sourceDir = makeTemporaryDirectory();
    const outDir = join(makeTemporaryDirectory(), "staged");
    writeCliFixture(sourceDir);

    expect(await readCliBaseVersion(sourceDir)).toBe("3.44.1");

    const staged = await stagePreviewPackage({
      sourceDir,
      outDir,
      version: "3.44.1-preview-20260929-abc1234",
      dependencyVersion: "3.44.1",
    });

    const manifest = JSON.parse(readFileSync(join(outDir, "package.json"), "utf-8"));

    expect(staged).toEqual({
      name: PREVIEW_PACKAGE_NAME,
      version: "3.44.1-preview-20260929-abc1234",
    });
    expect(manifest.name).toBe("@wundero/bts");
    expect(manifest.version).toBe("3.44.1-preview-20260929-abc1234");
    expect(manifest.publishConfig).toEqual({ access: "public" });
    expect(manifest.bin).toEqual({ "create-better-t-stack": "dist/cli.mjs" });
    expect(manifest.files).toEqual(["dist"]);
    expect(manifest.exports).toEqual({
      ".": { import: "./dist/index.mjs" },
      "./cli": { import: "./dist/cli.mjs" },
    });
    expect(manifest.dependencies).toEqual({
      "@better-t-stack/template-generator": "^3.44.1",
      "@better-t-stack/types": "^3.44.1",
      semver: "^7.8.5",
    });
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
    expect(readFileSync(join(outDir, "dist", "cli.mjs"), "utf-8")).toContain("console.log('bts')");
  });

  test("copies the monorepo README.md into the staged package", async () => {
    const sourceDir = makeTemporaryDirectory();
    const outDir = join(makeTemporaryDirectory(), "staged");
    writeCliFixture(sourceDir);
    const readmePath = join(makeTemporaryDirectory(), "README.md");
    writeFileSync(readmePath, "# Better-T-Stack\n\nMonorepo root readme.\n");

    await stagePreviewPackage({
      sourceDir,
      outDir,
      version: "3.44.1-preview-20260929-abc1234",
      dependencyVersion: "3.44.1",
      readmePath,
    });

    expect(readFileSync(join(outDir, "README.md"), "utf-8")).toContain("Monorepo root readme.");
  });
});
