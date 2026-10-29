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
  emailRenderer: "none",
  emailDeploy: "none",
  i18n: "none",
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
  "cloudflare-self": "7248fec0561aae785049b2725a2c1db15edace3f2e9d944ba34baf8074e7ce19",
  "cloudflare-self+axiom": "7165a09cc36bf5ee27b56db8946ce36f3012bb7deb5b608db8714932eba9aaea",
  "cloudflare-split": "a4bf79696ae6d5076983995067fd312282c0de71047fa095d08449146169d7b1",
  "cloudflare-split+axiom": "87feac42e872699373c80440ab68c320904981c2b10fafec6a12bbc308218bc0",
  "prisma-web": "2200aedca5d4adcbeebf0ca6ab96409fc2fc7667eda4b1f46a256c4a3174cb6c",
  "prisma-web+axiom": "b79639e11a29db2032ff135580612f1366e8da85d418c91e18db05f3436881e7",
  "prisma-server": "fe530dc138f2f30912a80275ca2fe25032c0665befc16ab0274bbe7ace7ab044",
  "prisma-server+axiom": "3cb99440873e692937082c34b294c1661c37bfa5514456e60461026e89d46275",
  "aws-lambda": "e3fefeac02a96e953e9576012164eb15428bcc81b47c7d361e4d9c902d3acc3f",
  "aws-lambda+axiom": "fb3c1d894ed683377a99c59f89f051750ee839d82f19759b95414d1ea0e1d781",
  "aws-fargate": "504a68df36013d1c3ea0f53df701153e7e6eb630260c2f8fcf945c431b1b0fa0",
  "aws-fargate+axiom": "2535dcc8fe18b34e7b3f8930cfb459ad28c425398d058f172cf5b7316e8fe709",
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
