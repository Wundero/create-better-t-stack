import { describe, expect, it } from "bun:test";

import { EMBEDDED_TEMPLATES } from "@better-t-stack/template-generator";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type CreateOptions = Parameters<typeof createVirtual>[0];

const BLOCK_RANGE = /[\u2500-\u25FF]/u;

async function generateFiles(config: CreateOptions): Promise<Map<string, string>> {
  const result = await createVirtual({
    addons: ["none"],
    examples: ["none"],
    auth: "none",
    database: "none",
    orm: "none",
    dbSetup: "none",
    webDeploy: "none",
    serverDeploy: "none",
    install: false,
    git: false,
    packageManager: "bun",
    ...config,
  });

  expect(result.isOk()).toBe(true);

  if (result.isErr()) {
    throw result.error;
  }

  return collectFiles(result.value.root, result.value.root.path);
}

function findFile(files: Map<string, string>, suffix: string): string {
  const key = [...files.keys()].find((candidate) => candidate.endsWith(suffix));

  if (key === undefined) {
    throw new Error(
      `No generated file ends with "${suffix}". Keys: ${[...files.keys()].join(", ")}`,
    );
  }

  return files.get(key) ?? "";
}

const cases: Array<{ name: string; suffix: string; config: CreateOptions }> = [
  {
    name: "next",
    suffix: "src/app/page.tsx",
    config: {
      frontend: ["next"],
      backend: "self",
      runtime: "none",
      api: "trpc",
    },
  },
  {
    name: "tanstack-start",
    suffix: "src/routes/index.tsx",
    config: {
      frontend: ["tanstack-start"],
      api: "trpc",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
    },
  },
  {
    name: "react-router",
    suffix: "src/routes/_index.tsx",
    config: {
      frontend: ["react-router"],
      api: "trpc",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
    },
  },
  {
    name: "tanstack-router",
    suffix: "src/routes/index.tsx",
    config: {
      frontend: ["tanstack-router"],
      api: "trpc",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
    },
  },
  {
    name: "solid",
    suffix: "src/routes/index.tsx",
    config: {
      frontend: ["solid"],
      api: "orpc",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
    },
  },
  {
    name: "astro",
    suffix: "src/pages/index.astro",
    config: {
      frontend: ["astro"],
      api: "orpc",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
    },
  },
  {
    name: "nuxt",
    suffix: "app/pages/index.vue",
    config: {
      frontend: ["nuxt"],
      api: "orpc",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
    },
  },
  {
    name: "svelte",
    suffix: "src/routes/+page.svelte",
    config: {
      frontend: ["svelte"],
      api: "orpc",
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
    },
  },
];

describe("ASCII-only banner", () => {
  for (const testCase of cases) {
    it(`renders an ASCII-only banner for ${testCase.name}`, async () => {
      const files = await generateFiles(testCase.config);
      const content = findFile(files, testCase.suffix);

      expect(content).toContain("_|_|_|");
      expect(content).not.toContain("\\");
      expect(BLOCK_RANGE.test(content)).toBe(false);
    });
  }

  it("keeps every embedded template free of block-drawing characters", () => {
    const offenders = [...EMBEDDED_TEMPLATES.entries()]
      .filter(([, content]) => BLOCK_RANGE.test(content))
      .map(([name]) => name);

    expect(offenders).toEqual([]);
  });
});
