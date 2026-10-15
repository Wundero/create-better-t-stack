import { describe, expect, it } from "bun:test";
import path from "node:path";

import { generateReproducibleCommand } from "@better-t-stack/template-generator";
import fs from "fs-extra";

import { createVirtual } from "../src/index";
import { readBtsConfig } from "../src/utils/bts-config";
import { collectFiles } from "./setup";
import { expectSuccess, runCreateTest } from "./test-utils";

type VirtualConfig = Parameters<typeof createVirtual>[0];

const baseConfig = {
  projectName: "email-app",
  backend: "hono",
  runtime: "bun",
  api: "trpc",
  database: "sqlite",
  orm: "drizzle",
  frontend: ["tanstack-router"],
  auth: "none",
  payments: "none",
  dbSetup: "none",
  webDeploy: "none",
  serverDeploy: "none",
} satisfies VirtualConfig;

async function generate(overrides: VirtualConfig) {
  const result = await createVirtual({ ...baseConfig, ...overrides });
  if (result.isErr()) {
    throw new Error(`createVirtual failed: ${result.error.message}`);
  }
  const files = collectFiles(result.value.root, result.value.root.path);
  return files;
}

type GeneratedPackageJson = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function parseJsonFile(files: Map<string, string>, path: string): GeneratedPackageJson {
  const content = files.get(path);
  expect(content, `${path} should exist`).toBeDefined();
  return JSON.parse(content as string) as GeneratedPackageJson;
}

function assertNoStrayEscapes(files: Map<string, string>) {
  for (const [file, content] of files) {
    if (!file.startsWith("packages/email/")) continue;
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    expect(content.includes("\\{"), `${file} must not contain a stray backslash-brace`).toBe(false);
  }
}

describe("email renderer + email deploy", () => {
  it("S1: react-email with no deploy only ships the renderer package", async () => {
    const files = await generate({ emailRenderer: "react-email", emailDeploy: "none" });

    // package.json is valid JSON with the renderer dependency set.
    const pkg = parseJsonFile(files, "packages/email/package.json");
    expect(pkg.name).toBe("@email-app/email");
    const deps = pkg.dependencies ?? {};
    expect(deps["react-email"]).toBeDefined();
    expect(deps.react).toBeDefined();
    expect(deps["react-dom"]).toBeDefined();
    expect(deps["@aws-sdk/client-sesv2"]).toBeUndefined();

    // renderer surface
    expect(files.get("packages/email/src/index.ts")).toContain('export * from "./render"');
    expect(files.get("packages/email/src/render.ts")).toContain("renderEmail");
    expect(files.get("packages/email/src/components/button.tsx")).toBeDefined();
    expect(files.get("packages/email/src/components/card.tsx")).toBeDefined();
    expect(files.get("packages/email/src/components/input.tsx")).toBeDefined();
    expect(files.get("packages/email/src/components/label.tsx")).toBeDefined();
    expect(files.get("packages/email/src/components/textarea.tsx")).toBeDefined();
    expect(files.get("packages/email/src/templates/welcome.tsx")).toBeDefined();
    expect(files.get("packages/email/src/templates/verify-email.tsx")).toBeDefined();
    expect(files.get("packages/email/src/templates/reset-password.tsx")).toBeDefined();

    // no sender, no infra
    expect(files.get("packages/email/src/send.ts")).toBeUndefined();
    expect(files.get("packages/infra/alchemy.run.ts")).toBeUndefined();
    assertNoStrayEscapes(files);
  });

  it("S2: cloudflare deploy with no renderer ships only the sender + alchemy binding", async () => {
    const files = await generate({
      backend: "hono",
      runtime: "workers",
      frontend: ["tanstack-router"],
      database: "sqlite",
      orm: "drizzle",
      dbSetup: "d1",
      serverDeploy: "cloudflare",
      emailRenderer: "none",
      emailDeploy: "cloudflare",
    });

    const pkg = parseJsonFile(files, "packages/email/package.json");
    const deps = pkg.dependencies ?? {};
    expect(deps["react-email"]).toBeUndefined();
    expect(deps["@aws-sdk/client-sesv2"]).toBeUndefined();

    expect(files.get("packages/email/src/send.ts")).toContain("createCloudflareEmailSender");
    expect(files.get("packages/email/src/index.ts")).toContain('export * from "./send"');
    expect(files.get("packages/email/src/render.ts")).toBeUndefined();
    expect(files.get("packages/email/src/templates/welcome.tsx")).toBeUndefined();

    const alchemy = files.get("packages/infra/alchemy.run.ts");
    expect(alchemy).toBeDefined();
    expect(alchemy).toContain('Cloudflare.Email.SendEmail("EMAIL")');
    expect(alchemy).toContain("EMAIL: emailBinding,");
    expect(alchemy).not.toContain("SES.EmailIdentity");

    const infraSchema = files.get("packages/infra/.env.schema");
    expect(infraSchema).toContain("EMAIL_FROM");
  });

  it("S3: none + none produces no email package and no email infra", async () => {
    const files = await generate({ emailRenderer: "none", emailDeploy: "none" });

    expect(files.get("packages/email/package.json")).toBeUndefined();
    expect(files.get("packages/infra/alchemy.run.ts")).toBeUndefined();
  });

  it("S4: react-email + ses ships both halves and AWS alchemy provisioning", async () => {
    const files = await generate({ emailRenderer: "react-email", emailDeploy: "ses" });

    // valid JSON with both dependency groups
    const pkg = parseJsonFile(files, "packages/email/package.json");
    const deps = pkg.dependencies ?? {};
    expect(deps["react-email"]).toBeDefined();
    expect(deps["@aws-sdk/client-sesv2"]).toBeDefined();

    expect(files.get("packages/email/src/render.ts")).toBeDefined();
    expect(files.get("packages/email/src/send.ts")).toContain("createSesEmailSender");
    expect(files.get("packages/email/src/index.ts")).toContain('export * from "./render"');
    expect(files.get("packages/email/src/index.ts")).toContain('export * from "./send"');
    assertNoStrayEscapes(files);

    const alchemy = files.get("packages/infra/alchemy.run.ts");
    expect(alchemy).toBeDefined();
    expect(alchemy).toContain("AWS.providers()");
    expect(alchemy).toContain('SES.EmailIdentity("email-identity"');
    expect(alchemy).toContain("SES.ConfigurationSet");
    expect(alchemy).toContain("emailResources");
    expect(alchemy).toContain("AWS.state()");
    expect(alchemy).toContain('import * as SES from "alchemy/AWS/SES";');

    const infraSchema = files.get("packages/infra/.env.schema");
    expect(infraSchema).toContain("EMAIL_FROM");
    expect(infraSchema).toContain("AWS_REGION");
    expect(infraSchema).toContain("AWS_ACCESS_KEY_ID");
    expect(infraSchema).toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("S5: cloudflare email deploy without a Cloudflare Workers target is rejected", async () => {
    const result = await createVirtual({
      ...baseConfig,
      serverDeploy: "none",
      webDeploy: "none",
      emailRenderer: "none",
      emailDeploy: "cloudflare",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Cloudflare Workers deployment");
    }
  });

  it("S6: reproducible command carries both email flags", () => {
    const command = generateReproducibleCommand({
      projectName: "email-app",
      projectDir: "/tmp/email-app",
      relativePath: "./email-app",
      database: "sqlite",
      orm: "drizzle",
      backend: "hono",
      runtime: "bun",
      frontend: ["tanstack-router"],
      addons: [],
      examples: [],
      auth: "none",
      payments: "none",
      emailRenderer: "react-email",
      emailDeploy: "ses",
      git: false,
      packageManager: "bun",
      install: false,
      dbSetup: "none",
      api: "trpc",
      webDeploy: "none",
      serverDeploy: "none",
    });

    expect(command).toContain("--email-renderer react-email");
    expect(command).toContain("--email-deploy ses");
  });

  it("S7 (edge): every renderer/deploy combination yields valid package.json JSON", async () => {
    const combos = [
      { emailRenderer: "react-email" as const, emailDeploy: "none" as const },
      { emailRenderer: "none" as const, emailDeploy: "ses" as const },
      { emailRenderer: "none" as const, emailDeploy: "cloudflare" as const, extra: true },
      { emailRenderer: "react-email" as const, emailDeploy: "ses" as const },
      { emailRenderer: "react-email" as const, emailDeploy: "cloudflare" as const, extra: true },
    ];

    for (const combo of combos) {
      const { extra: _extra, ...fields } = combo as {
        emailRenderer: "react-email" | "none";
        emailDeploy: "none" | "ses" | "cloudflare";
        extra?: boolean;
      };
      const overrides: VirtualConfig = combo.extra
        ? {
            runtime: "workers",
            backend: "hono",
            database: "sqlite",
            orm: "drizzle",
            dbSetup: "d1",
            serverDeploy: "cloudflare",
            ...fields,
          }
        : { ...fields };

      const files = await generate(overrides);
      // must not throw
      parseJsonFile(files, "packages/email/package.json");
    }
  });

  it("S8: bts.jsonc and workspace wiring persist email selections on disk", async () => {
    const result = await runCreateTest({
      projectName: "email-bts-config",
      emailRenderer: "react-email",
      emailDeploy: "ses",
    });
    expectSuccess(result);

    const bts = await readBtsConfig(result.projectDir);
    expect(bts?.emailRenderer).toBe("react-email");
    expect(bts?.emailDeploy).toBe("ses");

    const pkg = JSON.parse(
      await fs.readFile(path.join(result.projectDir, "packages/email/package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["react-email"]).toBeDefined();
    expect(pkg.dependencies["@aws-sdk/client-sesv2"]).toBeDefined();
  });
});
