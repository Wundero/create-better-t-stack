import { describe, expect, it } from "bun:test";

import {
  AddInputSchema,
  AppKindSchema,
  AppNameSchema,
  BetterTStackConfigFileSchema,
  CLIInputSchema,
  CreateInputSchema,
  GenerateInputSchema,
  ScaffoldAppInputSchema,
  ScaffoldAppInputPartialSchema,
  ScaffoldPackageInputSchema,
} from "../../../packages/types/src/schemas";
import { getSchemaResult, SchemaNameSchema } from "../src/index";

describe("Input schemas", () => {
  it("accepts Alchemy as a database setup mode", () => {
    const result = CreateInputSchema.safeParse({
      projectName: "app",
      dbSetupOptions: { mode: "alchemy" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects conflicting manualDb and dbSetupOptions.mode inputs", () => {
    const result = CreateInputSchema.safeParse({
      projectName: "app",
      manualDb: true,
      dbSetupOptions: { mode: "manual" },
    });

    expect(result.success).toBe(false);
  });

  it("accepts safe workspace package names and rejects path-like names", () => {
    expect(AddInputSchema.safeParse({ package: "shared-utils" }).success).toBe(true);

    for (const packageName of ["../shared", "@acme/shared", "Shared", "node_modules"]) {
      expect(AddInputSchema.safeParse({ package: packageName }).success).toBe(false);
    }
  });

  it("rejects conflicting task-runner addon combinations", () => {
    const conflictingAddonPairs = [
      ["nx", "vite-plus"],
      ["turborepo", "vite-plus"],
      ["nx", "turborepo"],
      ["eslint", "vite-plus"],
    ];

    for (const addons of conflictingAddonPairs) {
      const result = AddInputSchema.safeParse({ addons });

      expect(result.success).toBe(false);
    }
  });

  it("rejects conflicting observability addon combinations", () => {
    const result = AddInputSchema.safeParse({ addons: ["evlog", "axiom"] });

    expect(result.success).toBe(false);
  });

  it("accepts the ESLint + Prettier addon on its own", () => {
    expect(AddInputSchema.safeParse({ addons: ["eslint"] }).success).toBe(true);
  });

  it("rejects unknown keys in JSON-first create input", () => {
    const result = CreateInputSchema.safeParse({
      projectName: "app",
      pakageManager: "bun",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown keys in bts.jsonc config payloads", () => {
    const result = BetterTStackConfigFileSchema.safeParse({
      version: "0.0.0",
      createdAt: new Date(0).toISOString(),
      projectName: "app",
      database: "sqlite",
      orm: "drizzle",
      backend: "hono",
      runtime: "bun",
      frontend: ["tanstack-router"],
      addons: ["none"],
      examples: ["none"],
      auth: "none",
      payments: "none",
      packageManager: "bun",
      dbSetup: "none",
      api: "trpc",
      webDeploy: "none",
      serverDeploy: "none",
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown nested addon option keys", () => {
    const result = CreateInputSchema.safeParse({
      projectName: "app",
      addonOptions: {
        skills: {
          agent: ["cursor"],
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown nested db setup option keys", () => {
    const result = CreateInputSchema.safeParse({
      projectName: "app",
      dbSetupOptions: {
        neon: {
          region: "aws-us-east-1",
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts the evlog agent skills source in addon options", () => {
    const result = CreateInputSchema.safeParse({
      projectName: "app",
      addonOptions: {
        skills: {
          selections: [
            {
              source: "https://www.evlog.dev",
              skills: ["review-logging-patterns", "analyze-logs"],
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("allows CLI input parsing on top of the refined create schema", () => {
    const result = CLIInputSchema.safeParse({
      projectDirectory: ".",
      projectName: "app",
      addons: ["biome"],
    });

    expect(result.success).toBe(true);
  });

  it("imports the MCP module without schema-construction crashes", async () => {
    const module = await import("../src/mcp");

    expect(module.createBtsMcpServer).toBeInstanceOf(Function);
  });

  it("exposes the Better T Stack config file JSON schema by name", () => {
    const schemaName = SchemaNameSchema.safeParse("betterTStackConfigFile");

    expect(schemaName.success).toBe(true);
    expect(getSchemaResult("betterTStackConfigFile")).toMatchObject({
      $schema: "http://json-schema.org/draft-07/schema#",
      $ref: "#/definitions/https:~1~1r2.better-t-stack.dev~1schema.json",
      definitions: {
        "https://r2.better-t-stack.dev/schema.json": {
          type: "object",
          additionalProperties: false,
          properties: { frontend: { type: "array" } },
        },
      },
    });
  });
});

describe("Scaffold and generate input schemas", () => {
  it("accepts env var validation in add input and still rejects unknown keys", () => {
    expect(AddInputSchema.safeParse({ envValidation: true }).success).toBe(true);
    expect(AddInputSchema.safeParse({ envValidation: true, unexpected: true }).success).toBe(false);
  });

  it("accepts safe scaffold package names and rejects invalid ones", () => {
    expect(ScaffoldPackageInputSchema.safeParse({ name: "shared" }).success).toBe(true);

    for (const name of ["@acme/shared", "Shared", "../x", "node_modules"]) {
      expect(ScaffoldPackageInputSchema.safeParse({ name }).success).toBe(false);
    }
  });

  it("validates app names", () => {
    for (const name of ["admin", "admin-app"]) {
      expect(AppNameSchema.safeParse(name).success).toBe(true);
    }

    for (const name of ["Admin", "../x", "node_modules", "a".repeat(65)]) {
      expect(AppNameSchema.safeParse(name).success).toBe(false);
    }
  });

  it("exposes the supported app kinds", () => {
    expect([...AppKindSchema.options]).toEqual(["frontend", "backend", "mobile"]);
  });

  it("accepts valid scaffold app inputs", () => {
    const validInputs = [
      { kind: "frontend", name: "admin", frontend: "next" },
      { kind: "backend", name: "worker", backend: "hono" },
      { kind: "mobile", name: "mobile", frontend: "native-bare" },
    ];

    for (const input of validInputs) {
      expect(ScaffoldAppInputSchema.safeParse(input).success).toBe(true);
    }
  });

  it("rejects scaffold app inputs with missing, forbidden, or kind-incompatible fields", () => {
    const invalidInputs = [
      { kind: "frontend", name: "x" },
      { kind: "frontend", name: "x", frontend: "native-bare" },
      { kind: "backend", name: "x" },
      { kind: "backend", name: "x", backend: "convex" },
      { kind: "backend", name: "x", backend: "self" },
      { kind: "mobile", name: "x", frontend: "next" },
    ];

    for (const input of invalidInputs) {
      expect(ScaffoldAppInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("rejects unknown keys in scaffold app inputs", () => {
    const result = ScaffoldAppInputSchema.safeParse({
      kind: "frontend",
      name: "admin",
      frontend: "next",
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it("exposes a refinement-free partial app input for incremental collection", () => {
    expect(ScaffoldAppInputPartialSchema.safeParse({}).success).toBe(true);
    expect(ScaffoldAppInputPartialSchema.safeParse({ kind: "frontend" }).success).toBe(true);
    expect(ScaffoldAppInputPartialSchema.safeParse({ name: "admin" }).success).toBe(true);
    expect(ScaffoldAppInputPartialSchema.safeParse({ unexpected: true }).success).toBe(false);
  });

  it("validates generate inputs by target", () => {
    expect(GenerateInputSchema.safeParse({ target: "package", name: "shared" }).success).toBe(true);
    expect(
      GenerateInputSchema.safeParse({
        target: "app",
        kind: "frontend",
        frontend: "next",
        name: "admin",
      }).success,
    ).toBe(true);

    expect(GenerateInputSchema.safeParse({ target: "nope" }).success).toBe(false);
    expect(
      GenerateInputSchema.safeParse({ target: "app", kind: "frontend", name: "admin" }).success,
    ).toBe(false);
  });

  it("keeps strictness per generate input branch", () => {
    expect(
      GenerateInputSchema.safeParse({ target: "package", name: "shared", unexpected: true })
        .success,
    ).toBe(false);
    expect(
      GenerateInputSchema.safeParse({
        target: "app",
        kind: "backend",
        name: "worker",
        backend: "hono",
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
