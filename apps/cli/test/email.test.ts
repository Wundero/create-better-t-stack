import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { expectSuccess, runTRPCTest } from "./test-utils";

describe("Email Option", () => {
  it("should generate packages/email when react-email is selected", async () => {
    const result = await runTRPCTest({
      projectName: "email-react",
      addons: ["none"],
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "better-auth",
      api: "trpc",
      examples: ["none"],
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
      email: "react-email",
      emailProvider: "none",
      install: false,
    });

    expectSuccess(result);
    expect(result.projectDir).toBeDefined();

    const emailPackageJson = join(result.projectDir!, "packages", "email", "package.json");
    const emailSrcIndex = join(result.projectDir!, "packages", "email", "src", "index.ts");
    const emailSend = join(result.projectDir!, "packages", "email", "src", "send.ts");
    const welcomeTemplate = join(
      result.projectDir!,
      "packages",
      "email",
      "src",
      "templates",
      "welcome.tsx",
    );

    expect(existsSync(emailPackageJson)).toBe(true);
    expect(existsSync(emailSrcIndex)).toBe(true);
    expect(existsSync(emailSend)).toBe(true);
    expect(existsSync(welcomeTemplate)).toBe(true);
  });

  it("should not generate packages/email when email is none", async () => {
    const result = await runTRPCTest({
      projectName: "email-none",
      addons: ["none"],
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "none",
      api: "trpc",
      examples: ["none"],
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
      email: "none",
      emailProvider: "none",
      install: false,
    });

    expectSuccess(result);
    expect(result.projectDir).toBeDefined();

    const emailPackageJson = join(result.projectDir!, "packages", "email", "package.json");
    expect(existsSync(emailPackageJson)).toBe(false);
  });
});
