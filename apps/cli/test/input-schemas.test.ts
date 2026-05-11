import { describe, expect, it } from "bun:test";

import {
  AddInputSchema,
  BetterTStackConfigFileSchema,
  CloudflareConfigSchema,
  CLIInputSchema,
  CreateInputSchema,
} from "../../../packages/types/src/schemas";
import { getSchemaResult, SchemaNameSchema } from "../src/index";

describe("Input schemas", () => {
  it("rejects conflicting manualDb and dbSetupOptions.mode inputs", () => {
    const result = CreateInputSchema.safeParse({
      projectName: "app",
      manualDb: true,
      dbSetupOptions: { mode: "manual" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects conflicting nx and turborepo addon combinations", () => {
    const result = AddInputSchema.safeParse({
      addons: ["nx", "turborepo"],
    });

    expect(result.success).toBe(false);
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
      packageScope: "@app",
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

  it("accepts valid Cloudflare config and rejects unknown Cloudflare keys", () => {
    expect(
      CloudflareConfigSchema.safeParse({
        hyperdrive: "postgres",
        bindings: ["workers-ai", "r2", "kv", "queue", "durable-object"],
        domains: {
          web: "app.example.com",
          server: "api.example.com",
          mode: "prompted",
        },
        email: {
          sender: "cloudflare",
        },
      }).success,
    ).toBe(true);

    expect(
      CreateInputSchema.safeParse({
        projectName: "app",
        cloudflare: {
          binding: ["r2"],
        },
      }).success,
    ).toBe(false);
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

  it("accepts valid package scopes and rejects malformed ones", () => {
    expect(
      CreateInputSchema.safeParse({ projectName: "app", packageScope: "@wundero" }).success,
    ).toBe(true);
    expect(
      CreateInputSchema.safeParse({ projectName: "app", packageScope: "wundero" }).success,
    ).toBe(false);
    expect(
      CreateInputSchema.safeParse({ projectName: "app", packageScope: "@Wundero" }).success,
    ).toBe(false);
    expect(
      CreateInputSchema.safeParse({ projectName: "app", packageScope: "@wundero/" }).success,
    ).toBe(false);
  });

  it("imports the MCP module without schema-construction crashes", async () => {
    const module = await import("../src/mcp");

    expect(typeof module.createBtsMcpServer).toBe("function");
  });

  it("exposes the Better T Stack config file JSON schema by name", () => {
    const schemaName = SchemaNameSchema.safeParse("betterTStackConfigFile");

    expect(schemaName.success).toBe(true);
    expect(getSchemaResult("betterTStackConfigFile")).toMatchObject({
      type: "object",
    });
  });

  it("exposes the package scope JSON schema by name", () => {
    const schemaName = SchemaNameSchema.safeParse("packageScope");

    expect(schemaName.success).toBe(true);
    expect(getSchemaResult("packageScope")).toMatchObject({
      type: "string",
    });
  });
});
