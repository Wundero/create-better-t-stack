import { describe, expect, it } from "bun:test";

import { EMBEDDED_TEMPLATES, generate } from "../../../packages/template-generator/src/index";
import type { ProjectConfig } from "../../../packages/types/src/index";
import { collectFiles } from "./setup";

function createConfig(portless: boolean, projectName = "portless-app"): ProjectConfig {
  return {
    projectName,
    projectDir: "/virtual",
    relativePath: "./virtual",
    database: "none",
    orm: "none",
    backend: "hono",
    runtime: "bun",
    frontend: ["next"],
    addons: [],
    examples: [],
    auth: "none",
    payments: "none",
    git: false,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
    emailRenderer: "none",
    emailDeploy: "none",
    portless,
  };
}

async function generateFiles(config: ProjectConfig): Promise<Map<string, string>> {
  const result = await generate({
    config,
    templates: EMBEDDED_TEMPLATES,
    version: "0.0.0-test",
  });

  expect(result.isOk()).toBe(true);
  if (result.isErr()) throw result.error;

  return collectFiles(result.value.root, result.value.root.path);
}

function readJson<T>(files: Map<string, string>, path: string): T {
  const content = files.get(path);
  if (!content) throw new Error(`Missing generated file: ${path}`);
  return JSON.parse(content) as T;
}

/** bts.jsonc carries leading `//` comments, so strip them before parsing. */
function readJsonc<T>(files: Map<string, string>, path: string): T {
  const content = files.get(path);
  if (!content) throw new Error(`Missing generated file: ${path}`);
  return JSON.parse(content.replace(/^\s*\/\/.*$/gm, "")) as T;
}

describe("portless generation", () => {
  it("writes the root portless.json apps map for existing apps", async () => {
    const files = await generateFiles(createConfig(true));
    const portlessConfig = readJson<{ apps: Record<string, { name: string }> }>(
      files,
      "portless.json",
    );

    expect(portlessConfig.apps).toEqual({
      "apps/web": { name: "portless-app" },
      "apps/server": { name: "api.portless-app" },
    });
  });

  it("adds portless to the root devDependencies", async () => {
    const files = await generateFiles(createConfig(true));
    const rootPkg = readJson<{ devDependencies?: Record<string, string> }>(files, "package.json");

    expect(rootPkg.devDependencies?.portless).toBeDefined();
  });

  it("wraps the web and server dev scripts with their portless names", async () => {
    const files = await generateFiles(createConfig(true));
    const webPkg = readJson<{ scripts?: Record<string, string> }>(files, "apps/web/package.json");
    const serverPkg = readJson<{ scripts?: Record<string, string> }>(
      files,
      "apps/server/package.json",
    );

    expect(webPkg.scripts?.dev).toBe("portless portless-app next dev");
    expect(serverPkg.scripts?.dev).toBe("portless api.portless-app bun run --hot src/index.ts");
  });

  it("writes mode-scoped dev env files with the portless origins", async () => {
    const files = await generateFiles(createConfig(true));
    const webEnv = files.get("apps/web/.env.development");
    const serverEnv = files.get("apps/server/.env.development");

    expect(webEnv).toBeDefined();
    expect(webEnv).toContain("NEXT_PUBLIC_SERVER_URL=https://api.portless-app.localhost");
    expect(serverEnv).toBeDefined();
    expect(serverEnv).toContain("CORS_ORIGIN=https://portless-app.localhost");
  });

  it("ignores the generated dev env files in .gitignore", async () => {
    const files = await generateFiles(createConfig(true));
    const gitignore = files.get(".gitignore");

    expect(gitignore).toBeDefined();
    expect(gitignore).toContain(".env.development");
  });

  it("keeps the portless wrapper when Alchemy renames dev to dev:bare", async () => {
    const files = await generateFiles({ ...createConfig(true), webDeploy: "cloudflare" });
    const webPkg = readJson<{ scripts?: Record<string, string> }>(files, "apps/web/package.json");

    expect(webPkg.scripts?.dev).toBeUndefined();
    expect(webPkg.scripts?.["dev:bare"]).toBe("portless portless-app next dev");
  });

  it("loads the portless env file for a Node tsx dev server", async () => {
    const files = await generateFiles({ ...createConfig(true), runtime: "node" });
    const serverPkg = readJson<{ scripts?: Record<string, string> }>(
      files,
      "apps/server/package.json",
    );

    expect(serverPkg.scripts?.dev).toBe(
      "portless api.portless-app tsx watch --env-file=.env.development src/index.ts",
    );
  });

  it("documents the portless dev URLs in the README", async () => {
    const files = await generateFiles(createConfig(true));
    const readme = files.get("README.md") ?? "";

    expect(readme).toContain("## Portless Development");
    expect(readme).toContain("https://portless-app.localhost");
    expect(readme).toContain("https://api.portless-app.localhost");
  });

  it("persists portless into bts.jsonc and the reproducible command", async () => {
    const files = await generateFiles(createConfig(true));
    const btsConfig = readJsonc<{ portless?: boolean; reproducibleCommand?: string }>(
      files,
      "bts.jsonc",
    );

    expect(btsConfig.portless).toBe(true);
    expect(btsConfig.reproducibleCommand).toContain("--portless");
  });

  it("sanitizes the project name into a portless-safe slug", async () => {
    const files = await generateFiles(createConfig(true, "My App!"));
    const portlessConfig = readJson<{ apps: Record<string, { name: string }> }>(
      files,
      "portless.json",
    );

    expect(portlessConfig.apps["apps/web"]?.name).toBe("my-app");
    expect(portlessConfig.apps["apps/server"]?.name).toBe("api.my-app");
  });
});

describe("non-portless generation", () => {
  it("does not write portless.json and leaves dev scripts unwrapped", async () => {
    const files = await generateFiles(createConfig(false));
    const webPkg = readJson<{ scripts?: Record<string, string> }>(files, "apps/web/package.json");
    const serverPkg = readJson<{ scripts?: Record<string, string> }>(
      files,
      "apps/server/package.json",
    );
    const rootPkg = readJson<{ devDependencies?: Record<string, string> }>(files, "package.json");

    expect(files.has("portless.json")).toBe(false);
    expect(files.has("apps/web/.env.development")).toBe(false);
    expect(files.has("apps/server/.env.development")).toBe(false);
    expect(rootPkg.devDependencies?.portless).toBeUndefined();
    expect(webPkg.scripts?.dev).toBe("next dev --port 3001");
    expect(serverPkg.scripts?.dev).toBe("bun run --hot src/index.ts");
    expect(files.get("README.md") ?? "").not.toContain("Portless Development");
  });
});

describe("portless edge cases", () => {
  it("does not emit an undeclared CORS_ORIGIN for a self backend without clerk", async () => {
    const files = await generateFiles({
      ...createConfig(true),
      backend: "self",
      runtime: "none",
      api: "none",
      auth: "better-auth",
    });
    const webEnv = files.get("apps/web/.env.development") ?? "";

    expect(webEnv).toContain("BETTER_AUTH_URL=https://portless-app.localhost");
    expect(webEnv).not.toContain("CORS_ORIGIN");
  });

  it("emits CORS_ORIGIN for a self backend with clerk", async () => {
    const files = await generateFiles({
      ...createConfig(true),
      backend: "self",
      runtime: "none",
      api: "none",
      auth: "clerk",
    });
    const webEnv = files.get("apps/web/.env.development") ?? "";

    expect(webEnv).toContain("CORS_ORIGIN=https://portless-app.localhost");
  });

  it("does not add portless artifacts when there are no apps", async () => {
    const files = await generateFiles({
      ...createConfig(true),
      frontend: [],
      backend: "none",
      runtime: "none",
      api: "none",
    });
    const rootPkg = readJson<{ devDependencies?: Record<string, string> }>(files, "package.json");

    expect(files.has("portless.json")).toBe(false);
    expect(rootPkg.devDependencies?.portless).toBeUndefined();
    expect(files.get(".gitignore") ?? "").not.toContain(".env.development");
  });
});
