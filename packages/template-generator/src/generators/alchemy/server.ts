import { awsServerEnvEntries, cloudflareServerEnvEntries, prismaServerEnvEntries } from "./env";
import type { AlchemyDeploymentPlan, AlchemyServerCompute } from "./plan";
import { writeLines, writeObject, type AlchemyWriter } from "./writer";

function writeCloudflareServer(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  writeObject(
    writer,
    'export const server = Cloudflare.Worker("server", {',
    () => {
      writer.writeLine('main: "../../apps/server/src/index.ts",');
      writeObject(
        writer,
        "compatibility: {",
        () => {
          writer.writeLine('flags: ["nodejs_compat"],');
        },
        "},",
      );
      writeObject(
        writer,
        "env: {",
        () => {
          writeLines(writer, cloudflareServerEnvEntries(plan));
        },
        "},",
      );
      writeObject(
        writer,
        "dev: {",
        () => {
          writer.writeLine("port: 3000,");
        },
        "},",
      );
    },
    "});",
  );
  writer.blankLine();
  writer.writeLine("export type ServerEnv = Cloudflare.InferEnv<typeof server>;");
}

function writePrismaServer(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  writer.writeLine('export const server = Prisma.Compute("server", Effect.gen(function* () {');
  writer.indent(() => {
    writer.writeLine("const project = yield* prismaProject;");
    writer.writeLine("const resolvedDatabaseEnv = yield* databaseEnv;");
    if (plan.hasAxiomServerRuntime) {
      writer.writeLine("const resolvedObservabilityEnv = yield* observabilityEnv;");
    }
    writer.blankLine();
    writer.writeLine("return {");
    writer.indent(() => {
      writer.writeLine("project,");
      writer.writeLine('path: "../../apps/server",');
      writeObject(
        writer,
        "build: {",
        () => {
          writer.writeLine('type: "auto",');
          writer.writeLine('framework: "bun",');
        },
        "},",
      );
      writer.writeLine('entrypoint: "src/index.ts",');
      writer.writeLine("port: 3000,");
      writeObject(
        writer,
        "env: {",
        () => {
          writeLines(writer, prismaServerEnvEntries(plan));
        },
        "},",
      );
      writer.writeLine('healthCheck: { path: "/" },');
      writer.writeLine("destroyOldDeployment: true,");
      writeObject(
        writer,
        "dev: {",
        () => {
          writer.writeLine(`command: "${plan.config.packageManager} run dev:bare",`);
          writer.writeLine("port: 3000,");
        },
        "},",
      );
    });
    writer.writeLine("};");
  });
  writer.writeLine("}));");
}

function writeAwsServerEnv(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  writeObject(
    writer,
    "env: {",
    () => {
      if (plan.hasAlchemyManagedDatabase) writer.writeLine("...resolvedDatabaseEnv,");
      writeLines(writer, awsServerEnvEntries(plan));
    },
    "},",
  );
}

function writeAwsServerPrelude(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (plan.hasAwsNetwork) writer.writeLine("const { network } = yield* awsNetwork;");
  if (plan.hasAlchemyManagedDatabase) {
    writer.writeLine("const resolvedDatabaseEnv = yield* databaseEnv;");
  }
  if (plan.hasAxiomServerRuntime) {
    writer.writeLine("const resolvedObservabilityEnv = yield* observabilityEnv;");
  }
}

function writeAwsFargateServer(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  writer.writeLine("export const server = Effect.gen(function* () {");
  writer.indent(() => {
    writeAwsServerPrelude(writer, plan);
    writer.writeLine('const cluster = yield* AWS.ECS.Cluster("cluster", {});');
    writer.blankLine();
    writeObject(
      writer,
      'return yield* AWS.ECS.Service("server", {',
      () => {
        writer.writeLine("cluster,");
        writer.writeLine('context: "../..",');
        writer.writeLine('dockerfile: "apps/server/Dockerfile",');
        writer.writeLine("port: 3000,");
        writer.writeLine("desiredCount: 1,");
        writer.writeLine("loadBalancer: true,");
        if (plan.hasAwsNetwork) {
          writer.writeLine("vpcId: network.vpcId,");
          writer.writeLine("subnets: network.privateSubnetIds,");
          writer.writeLine("assignPublicIp: false,");
        } else {
          writer.writeLine("assignPublicIp: true,");
        }
        writeAwsServerEnv(writer, plan);
      },
      "});",
    );
  });
  writer.writeLine("});");
}

function writeAwsLambdaFunction(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  declaration: string,
): void {
  writeObject(
    writer,
    `${declaration}AWS.Lambda.Function("server", {`,
    () => {
      writer.writeLine('main: "../../apps/server/src/lambda.ts",');
      writer.writeLine('handler: "handler",');
      writer.writeLine("functionUrl: true,");
      writer.writeLine('runtime: "nodejs24.x",');
      writer.writeLine("memorySize: 1024,");
      writer.writeLine("timeout: Duration.seconds(30),");
      writeAwsServerEnv(writer, plan);
      if (plan.hasAwsNetwork) {
        writeObject(
          writer,
          "vpc: {",
          () => {
            writer.writeLine("subnetIds: network.privateSubnetIds,");
            writer.writeLine("securityGroupIds: [network.databaseSecurityGroup.groupId],");
          },
          "},",
        );
      }
    },
    "});",
  );
}

function writeAwsLambdaServer(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (plan.hasAwsNetwork || plan.hasAlchemyManagedDatabase || plan.hasAxiomServerRuntime) {
    writer.writeLine("export const server = Effect.gen(function* () {");
    writer.indent(() => {
      writeAwsServerPrelude(writer, plan);
      writeAwsLambdaFunction(writer, plan, "return yield* ");
    });
    writer.writeLine("});");
    return;
  }

  writeAwsLambdaFunction(writer, plan, "export const server = ");
}

function writeAwsServer(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  compute: AlchemyServerCompute,
): void {
  if (compute === "lambda") writeAwsLambdaServer(writer, plan);
  else writeAwsFargateServer(writer, plan);
}

export function writeServerResource(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  const server = plan.server;
  if (server.target === "none") return;
  if (server.target === "aws") {
    writeAwsServer(writer, plan, server.compute);
    return;
  }
  if (server.target === "cloudflare") writeCloudflareServer(writer, plan);
  else writePrismaServer(writer, plan);
}
