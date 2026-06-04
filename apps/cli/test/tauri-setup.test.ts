import { describe, expect, it } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { validateTauriSetup } from "../src/helpers/addons/tauri-setup";
import type { ProjectConfig } from "../src/types";

const TEST_DIR = join(import.meta.dir, ".test-tauri-validation");

function createTestConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "test-app",
    packageScope: "test-app",
    packageManager: "bun",
    frontend: ["tanstack-router"],
    backend: "hono",
    runtime: "bun",
    api: "trpc",
    database: "sqlite",
    orm: "drizzle",
    auth: "none",
    addons: ["tauri"],
    examples: ["none"],
    dbSetup: "none",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  } as ProjectConfig;
}

async function setupValidTauriFiles(projectDir: string) {
  const tauriDir = join(projectDir, "apps", "tauri", "src-tauri");
  const srcDir = join(tauriDir, "src");
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(tauriDir, "Cargo.toml"), `[package]\nname = "test-app"`);
  await writeFile(join(tauriDir, "tauri.conf.json"), JSON.stringify({ productName: "test-app" }));
  await writeFile(join(srcDir, "main.rs"), "fn main() {}");
  await writeFile(join(srcDir, "lib.rs"), "pub fn run() {}");
}

describe("Tauri validation", () => {
  it("should pass when all required files exist", async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    const config = createTestConfig({ projectDir: TEST_DIR });

    await setupValidTauriFiles(config.projectDir);

    const result = await validateTauriSetup(config);

    expect(result.isOk()).toBe(true);

    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should fail when Cargo.toml is missing", async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    const config = createTestConfig({ projectDir: TEST_DIR });

    await setupValidTauriFiles(config.projectDir);
    await rm(join(TEST_DIR, "apps", "tauri", "src-tauri", "Cargo.toml"));

    const result = await validateTauriSetup(config);

    expect(result.isErr()).toBe(true);
    const error = result.isErr() ? result.error : null;
    expect(error?.message).toContain("Cargo.toml");

    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should fail when tauri.conf.json is missing", async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    const config = createTestConfig({ projectDir: TEST_DIR });

    await setupValidTauriFiles(config.projectDir);
    await rm(join(TEST_DIR, "apps", "tauri", "src-tauri", "tauri.conf.json"));

    const result = await validateTauriSetup(config);

    expect(result.isErr()).toBe(true);
    const error = result.isErr() ? result.error : null;
    expect(error?.message).toContain("tauri.conf.json");

    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should fail when main.rs is missing", async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    const config = createTestConfig({ projectDir: TEST_DIR });

    await setupValidTauriFiles(config.projectDir);
    await rm(join(TEST_DIR, "apps", "tauri", "src-tauri", "src", "main.rs"));

    const result = await validateTauriSetup(config);

    expect(result.isErr()).toBe(true);
    const error = result.isErr() ? result.error : null;
    expect(error?.message).toContain("main.rs");

    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should fail when lib.rs is missing", async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    const config = createTestConfig({ projectDir: TEST_DIR });

    await setupValidTauriFiles(config.projectDir);
    await rm(join(TEST_DIR, "apps", "tauri", "src-tauri", "src", "lib.rs"));

    const result = await validateTauriSetup(config);

    expect(result.isErr()).toBe(true);
    const error = result.isErr() ? result.error : null;
    expect(error?.message).toContain("lib.rs");

    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should fail when all files are missing", async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    const config = createTestConfig({ projectDir: TEST_DIR });

    const result = await validateTauriSetup(config);

    expect(result.isErr()).toBe(true);
    const error = result.isErr() ? result.error : null;
    expect(error?.message).toContain("Cargo.toml");
    expect(error?.message).toContain("tauri.conf.json");
    expect(error?.message).toContain("main.rs");
    expect(error?.message).toContain("lib.rs");

    await rm(TEST_DIR, { recursive: true, force: true });
  });
});
