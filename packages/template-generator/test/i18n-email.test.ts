import { describe, expect, test } from "bun:test";

import { getI18nIntegrations, getI18nSurfaces, type ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../src/core/virtual-fs";
import {
  processI18nIntegrations,
  processI18nIntegrationTemplates,
} from "../src/processors/i18n/integrations";
import { processI18nTemplates } from "../src/template-handlers/i18n";
import type { TemplateData } from "../src/template-handlers/utils";

/**
 * Focused coverage for the `wt/i18n-email` stacked branch (task 7.10):
 * the `react-email-locale` integration and the `email` surface glue fire only
 * when the email feature exists, and the emitted template comes from the
 * selected i18n library.
 */

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["none"],
    addons: ["turborepo"],
    examples: [],
    auth: "better-auth",
    payments: "none",
    i18n: "lingui",
    git: true,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
    emailRenderer: "react-email",
    emailDeploy: "none",
    ...overrides,
  };
}

const SURFACE_TEMPLATES: TemplateData = new Map([
  ["i18n/surface/lingui/email/src/i18n.ts", "lingui-email-glue"],
  ["i18n/surface/lingui/email/src/templates/verify-email.tsx", "lingui-verify"],
  ["i18n/surface/lingui/email/src/templates/reset-password.tsx", "lingui-reset"],
  ["i18n/surface/i18next/email/src/i18n.ts", "i18next-email-glue"],
  ["i18n/surface/i18next/email/src/templates/verify-email.tsx", "i18next-verify"],
  ["i18n/surface/i18next/email/src/templates/reset-password.tsx", "i18next-reset"],
]);

const INTEGRATION_TEMPLATES: TemplateData = new Map([
  ["i18n/integrations/email/auth-email.tsx.hbs", "auth-email-module"],
]);

const AUTH_SERVER_STUB = [
  'import { betterAuth } from "better-auth";',
  "",
  "export function createAuth(env: AuthConfig) {",
  "  return betterAuth({",
  "    emailAndPassword: { enabled: true },",
  "    plugins: [",
  "    ],",
  "  });",
  "}",
  "",
].join("\n");

const AUTH_TSCONFIG_COMPOSITE_STUB = [
  "{",
  '  "compilerOptions": {',
  '    "composite": true,',
  '    "noEmit": true',
  "  },",
  '  "include": ["src/**/*.ts"],',
  "}",
  "",
].join("\n");

const AUTH_TSCONFIG_PLAIN_STUB = [
  "{",
  '  "compilerOptions": {',
  '    "noEmit": true',
  "  }",
  "}",
  "",
].join("\n");

function authVfs(tsconfig: string): VirtualFileSystem {
  const vfs = new VirtualFileSystem();
  vfs.writeFile("packages/auth/package.json", JSON.stringify({ name: "@demo/auth" }));
  vfs.writeFile("packages/auth/src/index.ts", AUTH_SERVER_STUB);
  vfs.writeFile("packages/auth/tsconfig.json", tsconfig);
  vfs.writeFile("packages/email/package.json", JSON.stringify({ name: "@demo/email" }));
  return vfs;
}

function readDependencies(vfs: VirtualFileSystem, filePath: string): Record<string, string> {
  const pkg = vfs.readJson<{ dependencies?: Record<string, string> }>(filePath);
  return pkg?.dependencies ?? {};
}

async function runIntegration(vfs: VirtualFileSystem, config: ProjectConfig): Promise<void> {
  await processI18nIntegrationTemplates(vfs, INTEGRATION_TEMPLATES, config);
  processI18nIntegrations(vfs, config);
}

describe("email surface derivation", () => {
  test("only reports the email surface for the react-email renderer", () => {
    expect(getI18nSurfaces(baseConfig())).toContain("email");
    expect(getI18nSurfaces(baseConfig({ emailRenderer: "none" }))).not.toContain("email");
  });

  test("only activates react-email-locale when the email surface is present", () => {
    const active = getI18nIntegrations(baseConfig(), "lingui").map((i) => i.id);
    expect(active).toContain("react-email-locale");

    const inactive = getI18nIntegrations(baseConfig({ emailRenderer: "none" }), "lingui").map(
      (i) => i.id,
    );
    expect(inactive).not.toContain("react-email-locale");
  });
});

describe("email surface glue", () => {
  test("emits the locale-aware email templates of the selected library", async () => {
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, SURFACE_TEMPLATES, baseConfig());

    expect(vfs.readFile("packages/email/src/i18n.ts")).toBe("lingui-email-glue");
    expect(vfs.readFile("packages/email/src/templates/verify-email.tsx")).toBe("lingui-verify");
    expect(vfs.readFile("packages/email/src/templates/reset-password.tsx")).toBe("lingui-reset");
  });

  test("routes to the templates of the configured library", async () => {
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, SURFACE_TEMPLATES, baseConfig({ i18n: "i18next" }));

    expect(vfs.readFile("packages/email/src/i18n.ts")).toBe("i18next-email-glue");
    expect(vfs.readFile("packages/email/src/templates/verify-email.tsx")).toBe("i18next-verify");
  });

  test("emits nothing when the email renderer is none", async () => {
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, SURFACE_TEMPLATES, baseConfig({ emailRenderer: "none" }));

    expect(vfs.exists("packages/email/src/i18n.ts")).toBe(false);
    expect(vfs.exists("packages/email/src/templates/verify-email.tsx")).toBe(false);
  });
});

describe("react-email-locale integration", () => {
  test("emits the auth callbacks and patches the Better Auth server", async () => {
    const vfs = authVfs(AUTH_TSCONFIG_COMPOSITE_STUB);
    await runIntegration(vfs, baseConfig());

    expect(vfs.readFile("packages/auth/src/email.tsx")).toBe("auth-email-module");

    const server = vfs.readFile("packages/auth/src/index.ts") ?? "";
    expect(server).toContain('import { sendResetPassword, sendVerificationEmail } from "./email";');
    expect(server).toContain("      sendResetPassword,");
    expect(server).toContain("    emailVerification: {");
    expect(server).toContain("      sendVerificationEmail,");

    const authDependencies = readDependencies(vfs, "packages/auth/package.json");
    expect(authDependencies["@demo/email"]).toBeDefined();
    expect(authDependencies.react).toBe("^19.2.8");
    const authDevDependencies =
      vfs.readJson<{ devDependencies?: Record<string, string> }>("packages/auth/package.json")
        ?.devDependencies ?? {};
    expect(authDevDependencies["@types/react"]).toBe("^19.2.18");

    const emailDependencies = readDependencies(vfs, "packages/email/package.json");
    expect(emailDependencies["@demo/i18n"]).toBeDefined();
    expect(emailDependencies["@lingui/core"]).toBeDefined();
  });

  test("enables JSX and adds tsx to the auth include when it is explicit", async () => {
    const vfs = authVfs(AUTH_TSCONFIG_COMPOSITE_STUB);
    await runIntegration(vfs, baseConfig());

    const tsconfig = vfs.readFile("packages/auth/tsconfig.json") ?? "";
    expect(tsconfig).toContain('"jsx": "react-jsx",');
    expect(tsconfig).toContain('"include": ["src/**/*.ts", "src/**/*.tsx"],');
  });

  test("enables JSX in the auth tsconfig variant without an include list", async () => {
    const vfs = authVfs(AUTH_TSCONFIG_PLAIN_STUB);
    await runIntegration(vfs, baseConfig());

    const tsconfig = vfs.readFile("packages/auth/tsconfig.json") ?? "";
    expect(tsconfig).toContain('"jsx": "react-jsx",');
    expect(tsconfig).not.toContain('"include"');
  });

  test("does not fire when the email renderer is none", async () => {
    const vfs = authVfs(AUTH_TSCONFIG_COMPOSITE_STUB);
    await runIntegration(vfs, baseConfig({ emailRenderer: "none" }));

    expect(vfs.exists("packages/auth/src/email.tsx")).toBe(false);

    const server = vfs.readFile("packages/auth/src/index.ts") ?? "";
    expect(server).not.toContain("sendResetPassword");
    const tsconfig = vfs.readFile("packages/auth/tsconfig.json") ?? "";
    expect(tsconfig).not.toContain('"jsx": "react-jsx"');
    expect(readDependencies(vfs, "packages/auth/package.json")["@demo/email"]).toBeUndefined();
    expect(readDependencies(vfs, "packages/email/package.json")["@lingui/core"]).toBeUndefined();
  });

  test("keeps working when the auth package is absent", async () => {
    const vfs = new VirtualFileSystem();
    vfs.writeFile("packages/email/package.json", JSON.stringify({ name: "@demo/email" }));
    await runIntegration(vfs, baseConfig());

    expect(vfs.exists("packages/auth/src/email.tsx")).toBe(false);
    expect(readDependencies(vfs, "packages/email/package.json")["@demo/i18n"]).toBeDefined();
  });
});
