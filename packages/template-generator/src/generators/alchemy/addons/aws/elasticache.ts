import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const awsElastiCacheRenderer: AddonRenderer = {
  resources(writer, plan) {
    writer.writeLine("export const awsElastiCache = Effect.gen(function* () {");
    writer.indent(() => {
      if (plan.hasAwsNetwork) {
        writer.writeLine("const { network } = yield* awsNetwork;");
        writeObject(
          writer,
          'const cacheSecurityGroup = yield* AWS.EC2.SecurityGroup("cache-security-group", {',
          () => {
            writer.writeLine("vpcId: network.vpcId,");
            writer.writeLine('description: "ElastiCache access",');
            writer.writeLine("ingress: [");
            writer.indent(() => {
              writeObject(
                writer,
                "{",
                () => {
                  writer.writeLine('ipProtocol: "tcp",');
                  writer.writeLine("fromPort: 6379,");
                  writer.writeLine("toPort: 6379,");
                  writer.writeLine('cidrIpv4: "10.0.0.0/16",');
                },
                "},",
              );
            });
            writer.writeLine("],");
          },
          "});",
        );
      }

      if (!plan.hasAwsNetwork) {
        writer.writeLine(
          "// No Alchemy-managed VPC is active: reach this cache from VPC-attached compute.",
        );
      }
      writeObject(
        writer,
        'const cache = yield* AWS.ElastiCache.ServerlessCache("cache", {',
        () => {
          writer.writeLine('engine: "valkey",');
          writeObject(
            writer,
            "cacheUsageLimits: {",
            () => {
              writer.writeLine("dataStorage: { maximum: 1 },");
              writer.writeLine("ecpuPerSecond: { maximum: 1000 },");
            },
            "},",
          );
          if (plan.hasAwsNetwork) {
            writer.writeLine("subnetIds: network.privateSubnetIds,");
            writer.writeLine("securityGroupIds: [cacheSecurityGroup.groupId],");
          }
        },
        "});",
      );
      writer.writeLine("return { cache };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { cache } = yield* awsElastiCache;");
  },
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-elasticache", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => {
            writer.writeLine("ELASTICACHE_HOST: cache.endpointAddress,");
            writer.writeLine("ELASTICACHE_PORT: cache.endpointPort,");
            writer.writeLine('ELASTICACHE_TLS: "true",');
          },
          "},",
        );
      },
      "});",
    );
  },
  appDeps() {
    return ["ioredis"];
  },
  exampleTemplatePrefix: "addons/aws-elasticache",
};
