import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type VirtualConfig = Parameters<typeof createVirtual>[0];

async function generateFiles(config: VirtualConfig): Promise<Map<string, string>> {
  const result = await createVirtual({
    projectName: "effect-check",
    backend: "self",
    runtime: "none",
    api: "trpc",
    auth: "better-auth",
    database: "sqlite",
    orm: "drizzle",
    addons: ["turborepo"],
    examples: ["none"],
    dbSetup: "d1",
    webDeploy: "cloudflare",
    serverDeploy: "none",
    install: false,
    git: false,
    packageManager: "bun",
    payments: "none",
    ...config,
  });

  expect(result.isOk()).toBe(true);

  if (result.isErr()) {
    throw result.error;
  }

  return collectFiles(result.value.root, result.value.root.path);
}

// `@effect/platform-node`/`-bun` declare `^4.0.0-rc.x` on `@effect/platform-node-shared`,
// and alchemy floats a few `@effect/*` deps. Those caret/patch ranges resolve to the newest
// rc while the direct deps stay pinned, mixing rc versions and breaking `alchemy` at runtime.
const FLOATED_EFFECT_PACKAGES = [
  "@effect/platform-node-shared",
  "@effect/sql-d1",
  "@effect/sql-sqlite-do",
  "@effect/vitest",
];

describe("alchemy @effect dependency alignment", () => {
  it("pins floated @effect packages via root overrides for bun projects", async () => {
    const files = await generateFiles({ frontend: ["next"] });

    const pkg = files.get("package.json");
    expect(pkg).toBeDefined();

    for (const name of FLOATED_EFFECT_PACKAGES) {
      expect(pkg).toContain(`"${name}"`);
    }
  });

  it("writes the overrides to pnpm-workspace.yaml for pnpm projects", async () => {
    const files = await generateFiles({ frontend: ["next"], packageManager: "pnpm" });

    const workspace = files.get("pnpm-workspace.yaml");
    expect(workspace).toBeDefined();

    for (const name of FLOATED_EFFECT_PACKAGES) {
      expect(workspace).toContain(name);
    }
  });

  it("does not add @effect overrides when no alchemy deploy target is used", async () => {
    const files = await generateFiles({
      frontend: ["next"],
      webDeploy: "none",
      dbSetup: "none",
      database: "none",
      orm: "none",
    });

    const pkg = files.get("package.json");
    expect(pkg).toBeDefined();
    expect(pkg).not.toContain("@effect/platform-node-shared");
  });
});
