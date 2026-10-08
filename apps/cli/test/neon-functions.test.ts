import { describe, expect, it } from "bun:test";

import { ALCHEMY_DEPLOY_TARGETS, isAlchemyDeployTarget } from "@better-t-stack/types";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type CreateOptions = Parameters<typeof createVirtual>[0];

const baseConfig = {
  projectName: "neon-functions",
  webDeploy: "none",
  serverDeploy: "neon",
  backend: "hono",
  runtime: "bun",
  database: "postgres",
  orm: "drizzle",
  auth: "none",
  payments: "none",
  api: "orpc",
  frontend: ["none"],
  addons: ["none"],
  examples: ["none"],
  dbSetup: "neon",
  install: false,
  git: false,
  packageManager: "bun",
} satisfies CreateOptions;

async function generate(overrides: Partial<CreateOptions>) {
  const result = await createVirtual({ ...baseConfig, ...overrides });
  if (result.isErr()) throw result.error;
  return collectFiles(result.value.root, result.value.root.path);
}

describe("Neon Functions server deployment", () => {
  it("narrows only the Neon server target into the Alchemy emitter", () => {
    expect(ALCHEMY_DEPLOY_TARGETS).toEqual(["cloudflare", "prisma", "aws", "neon"]);
    expect(isAlchemyDeployTarget("neon")).toBe(true);
    expect(isAlchemyDeployTarget("hetzner")).toBe(false);
    expect(isAlchemyDeployTarget("fly")).toBe(false);
    expect(isAlchemyDeployTarget("railway")).toBe(false);
  });

  it("deploys the generated server as a Neon Function on the managed database branch", async () => {
    const files = await generate({});
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain('import * as Neon from "alchemy/Neon";');
    expect(infra).toContain('Neon.Project("database"');
    expect(infra).toContain('Neon.Branch("database-branch"');
    expect(infra).toContain('migrations: "../../packages/db/src/migrations"');
    expect(infra).toContain("const branch = yield* neonBranch;");
    expect(infra).toContain('Neon.Function("server", {');
    expect(infra).toContain("branch,");
    expect(infra).toContain('main: "../../apps/server/src/index.ts"');
    expect(infra).toContain("Neon.providers()");
    expect(infra).toContain("providers: databaseProviders,");
    expect(infra).toContain("state: Alchemy.localState(),");
    expect(infra).toContain('CORS_ORIGIN: Config.String("CORS_ORIGIN"),');
    expect(infra).not.toContain("...databaseBindings");
  });

  it("creates a Neon project and branch when no managed database owns the function host", async () => {
    const files = await generate({
      projectName: "neon-standalone",
      dbSetup: "none",
      database: "none",
      orm: "none",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain('Neon.Project("server-project"');
    expect(infra).toContain('Neon.Branch("server-branch", { project });');
    expect(infra).toContain("const branch = yield* neonBranch;");
    expect(infra).toContain('Neon.Function("server", {');
    expect(infra).toContain("providers: Neon.providers(),");
  });

  it("provisions the Neon Buckets and AI Gateway addons with injected credentials", async () => {
    const files = await generate({
      projectName: "neon-addons",
      addons: ["neon-buckets", "neon-ai-gateway"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const serverPackage = JSON.parse(files.get("apps/server/package.json") ?? "{}") as {
      dependencies?: Record<string, string>;
    };

    expect(infra).toContain('Neon.Bucket("bucket"');
    expect(infra).toContain("branch: neonBranch,");
    expect(infra).toContain("forceDestroy: true,");
    expect(infra).toContain("const { bucket: neonBucket } = yield* neonBuckets;");
    expect(infra).toContain("S3_BUCKET_NAME: neonBucket.bucketName,");
    expect(infra).toContain('Neon.AIGateway("ai-gateway"');
    expect(infra).toContain("yield* neonAiGateway;");

    for (const dependency of ["@aws-sdk/client-s3", "@neon/ai-sdk-provider", "ai"]) {
      expect(serverPackage.dependencies?.[dependency]).toBeDefined();
    }

    const bucketsExample = files.get("apps/server/src/neon/buckets.ts") ?? "";
    expect(bucketsExample).toContain("process.env.AWS_ACCESS_KEY_ID");
    expect(bucketsExample).toContain("process.env.AWS_SECRET_ACCESS_KEY");
    expect(bucketsExample).toContain("process.env.AWS_ENDPOINT_URL_S3");
    expect(bucketsExample).toContain("process.env.AWS_REGION");
    expect(bucketsExample).toContain("process.env.S3_BUCKET_NAME");

    const aiGatewayExample = files.get("apps/server/src/neon/ai-gateway.ts") ?? "";
    expect(aiGatewayExample).toContain("process.env.NEON_AI_GATEWAY_BASE_URL");
    expect(aiGatewayExample).toContain("process.env.NEON_AI_GATEWAY_TOKEN");

    // Neon injects these on Functions; declaring them in `env` fails reconciliation.
    expect(infra).not.toContain("AWS_ACCESS_KEY_ID");
    expect(infra).not.toContain("NEON_AI_GATEWAY_TOKEN");
    expect(infra).not.toContain("NEON_AI_GATEWAY_BASE_URL");
  });

  it("binds Axiom observability into the Neon Function", async () => {
    const files = await generate({ projectName: "neon-axiom", addons: ["axiom"] });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("Axiom.providers()");
    expect(infra).toContain("const resolvedObservabilityEnv = yield* observabilityEnv;");
    expect(infra).toContain("...resolvedObservabilityEnv,");
  });

  it("binds PlanetScale MySQL credentials that Neon does not inject", async () => {
    const files = await generate({
      projectName: "neon-planetscale-mysql",
      database: "mysql",
      orm: "drizzle",
      dbSetup: "planetscale",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("...databaseBindings");
    expect(infra).toContain('Neon.Function("server", {');
    expect(infra).toContain("providers: Layer.mergeAll(Neon.providers(), databaseProviders),");
  });

  it("ignores Neon addons when no Neon server target is active", async () => {
    const files = await generate({
      projectName: "neon-inactive-addons",
      serverDeploy: "cloudflare",
      runtime: "workers",
      dbSetup: "none",
      database: "none",
      orm: "none",
      addons: ["neon-buckets", "neon-ai-gateway"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const serverPackage = JSON.parse(files.get("apps/server/package.json") ?? "{}") as {
      dependencies?: Record<string, string>;
    };

    expect(infra).toContain("export const server = Cloudflare.Worker(");
    expect(infra).not.toContain("Neon.");
    expect(serverPackage.dependencies?.["@aws-sdk/client-s3"]).toBeUndefined();
    expect(serverPackage.dependencies?.["@neon/ai-sdk-provider"]).toBeUndefined();
  });
});
