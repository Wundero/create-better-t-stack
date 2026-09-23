import { describe, expect, test } from "bun:test";

import {
  AddInputSchema,
  BetterTStackConfigSchema,
  CreateInputSchema,
  ProjectConfigSchema,
  SHADCN_BASE_TO_REGISTRY,
  SHADCN_BASE_VALUES,
  ShadcnBaseSchema,
  ShadcnConfigSchema,
} from "../src/schemas";

const shadcn = { preset: "b1x9M8ZeJW", base: "baseui", rtl: true, pointer: false } as const;

const baseProject = {
  projectName: "demo",
  projectDir: "/tmp/demo",
  relativePath: "demo",
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

const baseConfig = {
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00.000Z",
  database: "postgres",
  orm: "drizzle",
  backend: "hono",
  runtime: "node",
  frontend: ["next"],
  addons: ["biome"],
  examples: ["none"],
  auth: "better-auth",
  payments: "none",
  packageManager: "bun",
  dbSetup: "none",
  api: "trpc",
  webDeploy: "vercel",
  serverDeploy: "none",
} as const;

describe("ShadcnBaseSchema", () => {
  test("accepts the three registry bases", () => {
    expect(SHADCN_BASE_VALUES).toEqual(["baseui", "radixui", "react-aria"]);
    for (const base of SHADCN_BASE_VALUES) {
      expect(ShadcnBaseSchema.safeParse(base).success).toBe(true);
    }
    expect(SHADCN_BASE_TO_REGISTRY).toEqual({
      baseui: "base",
      radixui: "radix",
      "react-aria": "aria",
    });
  });

  test("rejects unknown bases", () => {
    expect(ShadcnBaseSchema.safeParse("radix").success).toBe(false);
    expect(ShadcnBaseSchema.safeParse("").success).toBe(false);
  });
});

describe("ShadcnConfigSchema", () => {
  test("accepts a full config and an empty one", () => {
    expect(ShadcnConfigSchema.parse(shadcn)).toEqual(shadcn);
    expect(ShadcnConfigSchema.parse({})).toEqual({});
  });

  test("rejects unknown keys", () => {
    expect(ShadcnConfigSchema.safeParse({ ...shadcn, theme: "neutral" }).success).toBe(false);
  });

  test("enforces a minimum preset length", () => {
    expect(ShadcnConfigSchema.safeParse({ preset: "a" }).success).toBe(false);
    expect(ShadcnConfigSchema.safeParse({ preset: "ab" }).success).toBe(true);
  });

  test("rejects non-boolean flags", () => {
    expect(ShadcnConfigSchema.safeParse({ rtl: "yes" }).success).toBe(false);
    expect(ShadcnConfigSchema.safeParse({ pointer: 1 }).success).toBe(false);
  });
});

describe("shadcn is accepted across all input schemas", () => {
  test("CreateInputSchema accepts shadcn and rejects nested unknown keys", () => {
    expect(CreateInputSchema.safeParse({ shadcn }).success).toBe(true);
    expect(CreateInputSchema.safeParse({ shadcn: { preset: "ab", nope: true } }).success).toBe(
      false,
    );
  });

  test("AddInputSchema accepts shadcn", () => {
    expect(AddInputSchema.safeParse({ shadcn }).success).toBe(true);
    expect(AddInputSchema.parse({ shadcn }).shadcn).toEqual(shadcn);
  });

  test("ProjectConfigSchema accepts and preserves shadcn", () => {
    expect(ProjectConfigSchema.safeParse({ ...baseProject, shadcn }).success).toBe(true);
    expect(ProjectConfigSchema.parse({ ...baseProject, shadcn }).shadcn).toEqual(shadcn);
  });

  test("BetterTStackConfigSchema accepts and preserves shadcn", () => {
    expect(BetterTStackConfigSchema.safeParse({ ...baseConfig, shadcn }).success).toBe(true);
    expect(BetterTStackConfigSchema.parse({ ...baseConfig, shadcn }).shadcn).toEqual(shadcn);
  });
});
