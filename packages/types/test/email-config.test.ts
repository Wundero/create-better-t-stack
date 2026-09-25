import { describe, expect, test } from "bun:test";

import { supportsCloudflareEmailDeploy } from "../src/compatibility";
import {
  BetterTStackConfigSchema,
  EMAIL_DEPLOY_VALUES,
  EMAIL_RENDERER_VALUES,
  ProjectConfigSchema,
} from "../src/schemas";

const baseProjectConfig = {
  projectName: "my-app",
  projectDir: "/tmp/my-app",
  relativePath: "my-app",
  database: "sqlite",
  orm: "drizzle",
  backend: "hono",
  runtime: "bun",
  frontend: ["tanstack-router"],
  addons: ["none"],
  examples: ["none"],
  auth: "none",
  payments: "none",
  git: true,
  packageManager: "bun",
  install: true,
  dbSetup: "none",
  api: "trpc",
  webDeploy: "none",
  serverDeploy: "none",
} as const;

const baseConfig = {
  version: "3.44.1",
  createdAt: "2026-01-01T00:00:00.000Z",
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
} as const;

describe("email config schemas", () => {
  test("ProjectConfigSchema requires both email fields", () => {
    expect(ProjectConfigSchema.safeParse(baseProjectConfig).success).toBe(false);
    expect(
      ProjectConfigSchema.safeParse({ ...baseProjectConfig, emailRenderer: "none" }).success,
    ).toBe(false);
    expect(
      ProjectConfigSchema.safeParse({ ...baseProjectConfig, emailDeploy: "none" }).success,
    ).toBe(false);
  });

  test("ProjectConfigSchema accepts the default email values", () => {
    const parsed = ProjectConfigSchema.parse({
      ...baseProjectConfig,
      emailRenderer: "none",
      emailDeploy: "none",
    });

    expect(parsed.emailRenderer).toBe("none");
    expect(parsed.emailDeploy).toBe("none");
  });

  test("BetterTStackConfigSchema stays backward compatible without the email keys", () => {
    const parsed = BetterTStackConfigSchema.parse(baseConfig);

    expect(parsed.emailRenderer).toBeUndefined();
    expect(parsed.emailDeploy).toBeUndefined();
  });

  test("BetterTStackConfigSchema accepts the email keys when present", () => {
    const parsed = BetterTStackConfigSchema.parse({
      ...baseConfig,
      emailRenderer: "react-email",
      emailDeploy: "ses",
    });

    expect(parsed.emailRenderer).toBe("react-email");
    expect(parsed.emailDeploy).toBe("ses");
  });

  test("email value constants match the enum options", () => {
    expect(EMAIL_RENDERER_VALUES).toEqual(["react-email", "none"]);
    expect(EMAIL_DEPLOY_VALUES).toEqual(["cloudflare", "ses", "none"]);
  });
});

describe("supportsCloudflareEmailDeploy", () => {
  test("allows Cloudflare server deploys", () => {
    expect(supportsCloudflareEmailDeploy("self", "cloudflare", "cloudflare")).toBe(true);
    expect(supportsCloudflareEmailDeploy("hono", "none", "cloudflare")).toBe(true);
  });

  test("allows self backend with Cloudflare web deploy", () => {
    expect(supportsCloudflareEmailDeploy("self", "cloudflare", "none")).toBe(true);
    expect(supportsCloudflareEmailDeploy("self", "cloudflare", undefined)).toBe(true);
  });

  test("rejects non-Workers deployments", () => {
    expect(supportsCloudflareEmailDeploy("hono", "none", "none")).toBe(false);
    expect(supportsCloudflareEmailDeploy("hono", "cloudflare", "none")).toBe(false);
  });
});
