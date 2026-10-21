import { describe, expect, it } from "bun:test";

import { usesAlchemyManagedDatabase } from "@better-t-stack/types";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type CreateOptions = Parameters<typeof createVirtual>[0];

const baseConfig = {
  projectName: "aws-deployment-test",
  webDeploy: "none",
  serverDeploy: "aws",
  backend: "hono",
  runtime: "bun",
  database: "postgres",
  orm: "drizzle",
  auth: "none",
  payments: "none",
  api: "trpc",
  frontend: ["none"],
  addons: ["none"],
  examples: ["none"],
  dbSetup: "none",
  install: false,
  git: false,
  packageManager: "bun",
} satisfies CreateOptions;

async function generate(overrides: Partial<CreateOptions>) {
  const result = await createVirtual({ ...baseConfig, ...overrides } as CreateOptions);
  if (result.isErr()) throw result.error;
  return collectFiles(result.value.root, result.value.root.path);
}

describe("AWS Alchemy deployment", () => {
  it("emits AWS providers, state, and a website for aws web deploy", async () => {
    const files = await generate({
      projectName: "aws-web",
      webDeploy: "aws",
      serverDeploy: "none",
      backend: "self",
      runtime: "none",
      frontend: ["astro"],
      api: "orpc",
      database: "none",
      orm: "none",
      dbSetup: "none",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain('import * as AWS from "alchemy/AWS"');
    expect(infra).toContain("AWS.providers()");
    expect(infra).toContain("state: AWS.state()");
    expect(infra).toContain('AWS.Website.Astro("web"');
  });

  it("emits ECS Fargate for a bun server and reuses the server Dockerfile", async () => {
    const files = await generate({
      projectName: "aws-ecs-bun",
      runtime: "bun",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("AWS.ECS.Cluster");
    expect(infra).toContain('AWS.ECS.Service("server"');
    expect(infra).toContain('context: "../.."');
    expect(infra).toContain('dockerfile: "apps/server/Dockerfile"');
    expect(files.has("apps/server/Dockerfile")).toBe(true);
  });

  it("emits a Lambda function and handler entry for the lambda runtime", async () => {
    const files = await generate({
      projectName: "aws-lambda",
      runtime: "lambda",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const handler = files.get("apps/server/src/lambda.ts") ?? "";

    expect(infra).toContain("AWS.Lambda.Function");
    expect(infra).toContain("functionUrl: true");
    expect(infra).toContain('handler: "handler"');
    expect(handler).toContain("hono/aws-lambda");
    expect(handler).toContain("handle(app)");
  });

  it("emits Aurora Serverless V2 postgres with a network and composed DATABASE_URL", async () => {
    const files = await generate({
      projectName: "aws-aurora-postgres",
      database: "postgres",
      orm: "prisma",
      dbSetup: "aurora",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("AWS.EC2.Network");
    expect(infra).toContain("AWS.RDS.DBSubnetGroup");
    expect(infra).toContain('AWS.RDS.DBCluster("database"');
    expect(infra).toContain("AWS.RDS.DBInstance");
    expect(infra).toContain('engine: "aurora-postgresql"');
    expect(infra).toContain("DATABASE_URL");
    expect(infra).toContain("AWS.state()");
  });

  it("selects the aurora-mysql engine for a mysql database", async () => {
    const files = await generate({
      projectName: "aws-aurora-mysql",
      database: "mysql",
      orm: "prisma",
      dbSetup: "aurora",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain('engine: "aurora-mysql"');
  });

  it("wires Lambda to Aurora over a VPC with DATABASE_URL and Data API migrations", async () => {
    const files = await generate({
      projectName: "aws-aurora-lambda",
      runtime: "lambda",
      database: "postgres",
      orm: "drizzle",
      dbSetup: "aurora",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const dbIndex = files.get("packages/db/src/index.ts") ?? "";

    expect(infra).toContain("AWS.Lambda.Function");
    expect(infra).toContain("vpc: {");
    expect(infra).toContain("subnetIds: network.privateSubnetIds");
    expect(infra).toContain("securityGroupIds: [network.databaseSecurityGroup.groupId]");
    expect(infra).toContain("...resolvedDatabaseEnv");
    expect(infra).toContain("DATABASE_URL: runtimeUrl");
    expect(infra).toContain("AWS.EC2.Network");
    expect(infra).toContain("enableHttpEndpoint: true");
    expect(infra).toContain('AWS.SecretsManager.Secret("database-secret"');
    expect(infra).toContain('Command.Exec("database-migrations"');
    expect(infra).toContain('command: "bun run db:migrate:aurora"');
    expect(infra).toContain("DATABASE_CLUSTER_ARN: cluster.dbClusterArn");
    expect(dbIndex).toContain("drizzle-orm/node-postgres");
    expect(files.has("packages/db/src/migrate-aurora.ts")).toBe(true);
  });

  it("emits the Aurora Data API driver and bindings for Cloudflare Workers", async () => {
    const files = await generate({
      projectName: "aws-aurora-workers",
      webDeploy: "none",
      serverDeploy: "cloudflare",
      runtime: "workers",
      database: "postgres",
      orm: "drizzle",
      dbSetup: "aurora",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const dbIndex = files.get("packages/db/src/index.ts") ?? "";
    const dbConfig = files.get("packages/db/src/config.ts") ?? "";
    const dbPackage = files.get("packages/db/package.json") ?? "";

    expect(infra).toContain("enableHttpEndpoint: true");
    expect(infra).toContain('AWS.SecretsManager.Secret("database-secret"');
    expect(infra).toContain("DATABASE_CLUSTER_ARN: cluster.dbClusterArn");
    expect(infra).toContain("DATABASE_SECRET_ARN: databaseSecret.secretArn");
    expect(infra).toContain('DATABASE_NAME: "app"');
    expect(infra).not.toContain("runtimeEnv: { DATABASE_URL: runtimeUrl }");
    expect(infra).toContain('Command.Exec("database-migrations"');
    expect(infra).toContain('command: "bun run db:migrate:aurora"');

    expect(dbConfig).toContain("DATABASE_CLUSTER_ARN: string;");
    expect(dbConfig).toContain("DATABASE_SECRET_ARN: string;");
    expect(dbConfig).toContain("DATABASE_NAME: string;");
    expect(dbIndex).toContain("drizzle-orm/aws-data-api/pg");
    expect(dbIndex).toContain("@aws-sdk/client-rds-data");
    expect(dbIndex).not.toContain("drizzle-orm/postgres-js");

    expect(dbPackage).toContain('"db:migrate:aurora": "tsx src/migrate-aurora.ts"');
    expect(dbPackage).toContain("@aws-sdk/client-rds-data");
    expect(files.has("packages/db/src/migrate-aurora.ts")).toBe(true);
  });

  it("rejects Prisma with Aurora on the Cloudflare Workers runtime", async () => {
    const result = await createVirtual({
      ...baseConfig,
      projectName: "aws-aurora-workers-prisma",
      webDeploy: "none",
      serverDeploy: "cloudflare",
      runtime: "workers",
      database: "postgres",
      orm: "prisma",
      dbSetup: "aurora",
    } as CreateOptions);

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain("Drizzle");
  });

  it("rejects the lambda runtime with a non-Hono backend", async () => {
    const result = await createVirtual({
      ...baseConfig,
      projectName: "aws-lambda-express",
      backend: "express",
      runtime: "lambda",
    } as CreateOptions);

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain("Lambda");
  });

  it("rejects Aurora without an AWS deployment target", async () => {
    const result = await createVirtual({
      ...baseConfig,
      projectName: "aws-aurora-orphan",
      serverDeploy: "none",
      webDeploy: "none",
      database: "postgres",
      orm: "drizzle",
      dbSetup: "aurora",
    } as CreateOptions);

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain("Aurora");
  });

  it("deploys solid to AWS through nitro's aws-lambda output", async () => {
    const files = await generate({
      projectName: "aws-web-solid",
      webDeploy: "aws",
      serverDeploy: "none",
      backend: "self",
      runtime: "none",
      frontend: ["solid"],
      api: "orpc",
      database: "none",
      orm: "none",
      dbSetup: "none",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const viteConfig = files.get("apps/web/vite.config.ts") ?? "";

    expect(viteConfig).toContain('preset: "aws-lambda"');
    expect(viteConfig).toContain("awsLambda: { streaming: true }");
    expect(infra).toContain('AWS.Lambda.Function("web-server"');
    expect(infra).toContain("bundle: false");
    expect(infra).toContain('invokeMode: "RESPONSE_STREAM"');
    expect(infra).toContain("timeout: Duration.seconds(30)");
    expect(infra).toContain("AWS.Website.makeKvSite(");
    expect(infra).toContain("${webBuild.outdir}/server/index.mjs");
    expect(infra).toContain("${webBuild.outdir}/public");
  });

  it("emits the solid AWS web resource inside the stack for a separate backend", async () => {
    const files = await generate({
      projectName: "aws-web-solid-split",
      webDeploy: "aws",
      serverDeploy: "none",
      backend: "none",
      runtime: "none",
      frontend: ["solid"],
      api: "none",
      database: "none",
      orm: "none",
      dbSetup: "none",
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("const webWorker = yield* Effect.gen(function* () {");
    expect(infra).toContain('AWS.Lambda.Function("web-server"');
    expect(infra).toContain("AWS.Website.makeKvSite(");
  });

  it("assigns aurora ownership to whatever Alchemy plane consumes it", () => {
    expect(
      usesAlchemyManagedDatabase({
        backend: "hono",
        dbSetup: "aurora",
        webDeploy: "none",
        serverDeploy: "aws",
      }),
    ).toBe(true);
    expect(
      usesAlchemyManagedDatabase({
        backend: "self",
        dbSetup: "aurora",
        webDeploy: "aws",
        serverDeploy: "none",
      }),
    ).toBe(true);
    expect(
      usesAlchemyManagedDatabase({
        backend: "hono",
        dbSetup: "aurora",
        webDeploy: "none",
        serverDeploy: "cloudflare",
      }),
    ).toBe(true);
  });
});
