import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import type { CLIInput, ProjectConfig } from "../src/types";
import { validateConfigCompatibility } from "../src/validation";
import { collectFiles } from "./setup";

function validate(config: Partial<ProjectConfig>) {
  return validateConfigCompatibility(
    config,
    new Set(Object.keys(config)),
    config as unknown as CLIInput,
  );
}

async function createVirtualFiles(config: Parameters<typeof createVirtual>[0]) {
  const result = await createVirtual(config);

  if (result.isErr()) {
    throw result.error;
  }

  return collectFiles(result.value.root, result.value.root.path);
}

describe("Cloudflare platform config validation", () => {
  it("allows Cloudflare config when a Cloudflare deployment is selected", () => {
    const result = validate({
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "workers",
      database: "postgres",
      orm: "drizzle",
      dbSetup: "neon",
      webDeploy: "none",
      serverDeploy: "cloudflare",
      cloudflare: {
        hyperdrive: "postgres",
        bindings: ["workers-ai", "r2"],
        domains: {
          server: "api.example.com",
          mode: "prompted",
        },
        email: {
          sender: "cloudflare",
        },
      },
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects Cloudflare config without a Cloudflare deployment", () => {
    const result = validate({
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
      cloudflare: {
        bindings: ["kv"],
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Cloudflare configuration requires");
    }
  });

  it("rejects Hyperdrive without a Postgres-compatible setup", () => {
    const result = validate({
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "workers",
      database: "postgres",
      orm: "drizzle",
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "cloudflare",
      cloudflare: {
        hyperdrive: "postgres",
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Postgres-compatible database setup");
    }
  });

  it("rejects web and server domains without matching Cloudflare deployments", () => {
    const webDomainResult = validate({
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "workers",
      database: "sqlite",
      orm: "drizzle",
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "cloudflare",
      cloudflare: {
        domains: {
          web: "app.example.com",
        },
      },
    });

    expect(webDomainResult.isErr()).toBe(true);
    if (webDomainResult.isErr()) {
      expect(webDomainResult.error.message).toContain("web domains");
    }

    const serverDomainResult = validate({
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      dbSetup: "none",
      webDeploy: "cloudflare",
      serverDeploy: "none",
      cloudflare: {
        domains: {
          server: "api.example.com",
        },
      },
    });

    expect(serverDomainResult.isErr()).toBe(true);
    if (serverDomainResult.isErr()) {
      expect(serverDomainResult.error.message).toContain("server domains");
    }
  });

  it("generates durable objects using the Cloudflare base class", async () => {
    const files = await createVirtualFiles({
      projectName: "cloudflare-durable-object",
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "workers",
      database: "none",
      orm: "none",
      auth: "none",
      addons: ["none"],
      examples: ["none"],
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "cloudflare",
      install: false,
      git: false,
      packageManager: "bun",
      payments: "none",
      api: "trpc",
      cloudflare: {
        bindings: ["durable-object"],
      },
    });

    const durableObject = files.get("packages/cloudflare/src/durable-object.ts");

    expect(durableObject).toContain('import { DurableObject } from "cloudflare:workers";');
    expect(durableObject).toContain(
      "export class AppDurableObject extends DurableObject<CloudflareBindings>",
    );
    expect(durableObject).toContain("super(ctx, env);");
    expect(durableObject).toContain("this.ctx.storage");
  });
});
