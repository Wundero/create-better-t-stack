import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import type { ProjectConfig } from "@better-t-stack/types";

import { generateAlchemyRun } from "../../../packages/template-generator/src/generators/alchemy/render";

const common = {
  projectDir: "/tmp/alchemy-scaffold",
  relativePath: "alchemy-scaffold",
  database: "postgres",
  backend: "hono",
  runtime: "bun",
  addons: [],
  examples: ["todo"],
  auth: "better-auth",
  payments: "none",
  git: false,
  install: false,
  packageManager: "bun",
  api: "orpc",
} satisfies Partial<ProjectConfig>;

const SCAFFOLD_CONFIGS = {
  "cloudflare-self": {
    ...common,
    projectName: "alchemy-scaffold-cloudflare-self",
    webDeploy: "cloudflare",
    serverDeploy: "none",
    backend: "self",
    runtime: "none",
    orm: "prisma",
    dbSetup: "neon",
    frontend: ["next"],
  },
  "cloudflare-split": {
    ...common,
    projectName: "alchemy-scaffold-cloudflare-split",
    webDeploy: "cloudflare",
    serverDeploy: "cloudflare",
    runtime: "workers",
    orm: "prisma",
    dbSetup: "neon",
    frontend: ["next"],
  },
  "prisma-web": {
    ...common,
    projectName: "alchemy-scaffold-prisma-web",
    webDeploy: "prisma",
    serverDeploy: "none",
    backend: "self",
    runtime: "none",
    orm: "prisma",
    dbSetup: "neon",
    frontend: ["solid"],
  },
  "prisma-server": {
    ...common,
    projectName: "alchemy-scaffold-prisma-server",
    webDeploy: "none",
    serverDeploy: "prisma",
    orm: "prisma",
    dbSetup: "neon",
    frontend: ["none"],
    examples: ["none"],
  },
  "aws-lambda": {
    ...common,
    projectName: "alchemy-scaffold-aws-lambda",
    webDeploy: "none",
    serverDeploy: "aws",
    runtime: "lambda",
    orm: "drizzle",
    dbSetup: "none",
    frontend: ["none"],
    examples: ["none"],
  },
  "aws-fargate": {
    ...common,
    projectName: "alchemy-scaffold-aws-fargate",
    webDeploy: "none",
    serverDeploy: "aws",
    orm: "drizzle",
    dbSetup: "none",
    frontend: ["none"],
    examples: ["none"],
  },
} satisfies Record<string, ProjectConfig>;

const GOLDEN_HASHES = {
  "cloudflare-self": "96c1495fc22f7e306907e905c1f459aa922ad9f0099e2a4b1666d58ff290a895",
  "cloudflare-self+axiom": "746146640d3a701026835b0e01d66353ae3b4223b03ebfb8a3e2828c7ecf419b",
  "cloudflare-split": "06eb865df8d92d3003be60c9f7f03bb4048e611c5e0c1230a6140df4bb3abcef",
  "cloudflare-split+axiom": "64fd7db311626177c499a951b34575748244bc036f0dd6f4b188e6079d1e2e38",
  "prisma-web": "c43b6c8f7bfe581b7315fc0c6e95a4b0af6a00cc92808df9f7db982dda64032e",
  "prisma-web+axiom": "57967e3a55478ffef133e8b71cec2c27e3195b6388377532b3607142b51a4c6d",
  "prisma-server": "53bd151f5f6414ecab0562fd82afe24a187d667c25483508ff978c7251e0dc1f",
  "prisma-server+axiom": "9da31be957442db6f9fc216a3b44866512a7b8751e40bc45deced4bf1945e72d",
  "aws-lambda": "decbdf2d87b081ea2a283d8c158b35939b63de580be091255bc4feab8c104e2f",
  "aws-lambda+axiom": "bb248bc9cb16f3b8f9889dfb329bf5d92118018f83bf71df08dd26676f17a1aa",
  "aws-fargate": "1a341ca098962ff6a255848a60798937aa33d5ed722b64002df4ed00a1c50511",
  "aws-fargate+axiom": "02f5fe6a1d1f8daa974bddb8799cc52db204eb0814abf85b4a02b75991eb256e",
};

function renderHash(config: ProjectConfig): string {
  return createHash("sha256").update(generateAlchemyRun(config)).digest("hex");
}

describe("Alchemy generator scaffold", () => {
  it("keeps generated alchemy.run.ts byte-identical for the canonical matrix", () => {
    const rendered = new Map<string, string>();

    for (const [name, config] of Object.entries(SCAFFOLD_CONFIGS)) {
      for (const axiom of [false, true]) {
        const full: ProjectConfig = axiom
          ? { ...config, addons: [...config.addons, "axiom"] }
          : config;
        rendered.set(`${name}${axiom ? "+axiom" : ""}`, renderHash(full));
      }
    }

    expect(rendered).toEqual(new Map(Object.entries(GOLDEN_HASHES)));
  });
});
