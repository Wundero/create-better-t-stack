import { describe, expect, test } from "bun:test";

import type { BetterTStackConfig, ProjectConfig, ShadcnConfig } from "@better-t-stack/types";
import { BetterTStackConfigFileSchema, ProjectConfigSchema } from "@better-t-stack/types";

import { writeBtsConfigToVfs } from "../src/bts-config";
import { VirtualFileSystem } from "../src/core/virtual-fs";
import { generateReproducibleCommand } from "../src/utils/reproducible-command";

const BASE_CONFIG = {
  projectName: "shadcn-demo",
  projectDir: "/tmp/shadcn-demo",
  relativePath: "shadcn-demo",
  database: "postgres",
  orm: "drizzle",
  backend: "hono",
  runtime: "node",
  frontend: ["next"],
  addons: ["biome"],
  examples: ["none"],
  auth: "better-auth",
  payments: "none",
  git: true,
  packageManager: "bun",
  install: true,
  dbSetup: "none",
  api: "trpc",
  webDeploy: "vercel",
  serverDeploy: "none",
} as const;

const FULL_SHADCN = {
  preset: "b1x9M8ZeJW",
  base: "radixui",
  rtl: true,
  pointer: true,
} as const;

function buildProjectConfig(shadcn?: ShadcnConfig): ProjectConfig {
  return ProjectConfigSchema.parse(shadcn === undefined ? BASE_CONFIG : { ...BASE_CONFIG, shadcn });
}

function writeBtsConfig(config: ProjectConfig): VirtualFileSystem {
  const vfs = new VirtualFileSystem();
  writeBtsConfigToVfs(vfs, config, "9.9.9");
  return vfs;
}

function readBtsConfig(vfs: VirtualFileSystem): BetterTStackConfig {
  const content = vfs.readFile("bts.jsonc");
  if (content === undefined) {
    throw new Error("expected bts.jsonc to be written to the virtual file system");
  }
  const jsonStart = content.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("expected bts.jsonc to contain JSON content");
  }
  const parsed: unknown = JSON.parse(content.slice(jsonStart));
  return BetterTStackConfigFileSchema.parse(parsed);
}

describe("bts.jsonc shadcn output", () => {
  test("includes the shadcn config when it is present", () => {
    const vfs = writeBtsConfig(buildProjectConfig(FULL_SHADCN));

    expect(readBtsConfig(vfs).shadcn).toEqual(FULL_SHADCN);
  });

  test("omits the shadcn key when no shadcn config is set", () => {
    const vfs = writeBtsConfig(buildProjectConfig());

    expect(readBtsConfig(vfs)).not.toHaveProperty("shadcn");
  });
});

describe("reproducible command shadcn flags", () => {
  test("emits preset, non-default base, rtl and pointer when configured", () => {
    const command = generateReproducibleCommand(buildProjectConfig(FULL_SHADCN));

    expect(command).toContain("--shadcn-preset b1x9M8ZeJW");
    expect(command).toContain("--shadcn-base radixui");
    expect(command.split(" ")).toContain("--shadcn-rtl");
    expect(command.split(" ")).toContain("--shadcn-pointer");
  });

  test("places shadcn flags after addon/example flags and before trailing setup flags", () => {
    const command = generateReproducibleCommand(buildProjectConfig(FULL_SHADCN));
    const examplesIndex = command.indexOf("--examples");
    const shadcnIndex = command.indexOf("--shadcn-preset");
    const dbSetupIndex = command.indexOf("--db-setup");

    expect(examplesIndex).toBeGreaterThanOrEqual(0);
    expect(shadcnIndex).toBeGreaterThan(examplesIndex);
    expect(shadcnIndex).toBeLessThan(dbSetupIndex);
  });

  test("omits --shadcn-base when the base is baseui", () => {
    const command = generateReproducibleCommand(
      buildProjectConfig({ preset: "b1x9M8ZeJW", base: "baseui" }),
    );

    expect(command).toContain("--shadcn-preset b1x9M8ZeJW");
    expect(command).not.toContain("--shadcn-base");
  });

  test("emits --shadcn-base without --shadcn-preset when only the base is set", () => {
    const command = generateReproducibleCommand(buildProjectConfig({ base: "radixui" }));

    expect(command).toContain("--shadcn-base radixui");
    expect(command).not.toContain("--shadcn-preset");
  });

  test("omits rtl and pointer flags when they are false or unset", () => {
    const command = generateReproducibleCommand(
      buildProjectConfig({ preset: "b1x9M8ZeJW", rtl: false, pointer: false }),
    );

    expect(command).toContain("--shadcn-preset b1x9M8ZeJW");
    expect(command).not.toContain("--shadcn-rtl");
    expect(command).not.toContain("--shadcn-pointer");
  });

  test("emits nothing shadcn-related when shadcn is unset or empty", () => {
    expect(generateReproducibleCommand(buildProjectConfig())).not.toContain("--shadcn");
    expect(generateReproducibleCommand(buildProjectConfig({}))).not.toContain("--shadcn");
  });
});
