import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type CreateOptions = Parameters<typeof createVirtual>[0];

const baseConfig = {
  projectName: "aws-addon",
  webDeploy: "none",
  serverDeploy: "aws",
  backend: "hono",
  runtime: "lambda",
  database: "none",
  orm: "none",
  auth: "none",
  payments: "none",
  api: "orpc",
  frontend: ["none"],
  addons: ["none"],
  examples: ["none"],
  dbSetup: "none",
  install: false,
  git: false,
  packageManager: "bun",
} satisfies CreateOptions;

async function generate(overrides: Partial<CreateOptions>) {
  const result = await createVirtual({ ...baseConfig, ...overrides });
  if (result.isErr()) throw result.error;
  return collectFiles(result.value.root, result.value.root.path);
}

type AddonCase = {
  addon: string;
  declarations: string[];
  env: string[];
  appDeps?: string[];
  exampleFile: string;
};

const ADDON_CASES: AddonCase[] = [
  {
    addon: "aws-s3",
    declarations: ["export const awsS3 = Effect.gen", 'AWS.S3.Bucket("s3-bucket"'],
    env: ["S3_BUCKET_NAME: s3Bucket.bucketName,", "S3_BUCKET_ARN: s3Bucket.bucketArn,"],
    appDeps: ["@aws-sdk/client-s3"],
    exampleFile: "apps/server/src/aws/s3.ts",
  },
  {
    addon: "aws-sqs",
    declarations: ["export const awsSqs = Effect.gen", 'AWS.SQS.Queue("job-queue"'],
    env: [
      "SQS_QUEUE_URL: sqsQueue.queueUrl,",
      "SQS_QUEUE_ARN: sqsQueue.queueArn,",
      "SQS_QUEUE_NAME: sqsQueue.queueName,",
    ],
    appDeps: ["@aws-sdk/client-sqs"],
    exampleFile: "apps/server/src/aws/sqs.ts",
  },
  {
    addon: "aws-sns",
    declarations: ["export const awsSns = Effect.gen", 'AWS.SNS.Topic("notifications-topic"'],
    env: ["SNS_TOPIC_ARN: snsTopic.topicArn,", "SNS_TOPIC_NAME: snsTopic.topicName,"],
    appDeps: ["@aws-sdk/client-sns"],
    exampleFile: "apps/server/src/aws/sns.ts",
  },
  {
    addon: "aws-kinesis",
    declarations: ["export const awsKinesis = Effect.gen", 'AWS.Kinesis.Stream("event-stream"'],
    env: [
      "KINESIS_STREAM_NAME: kinesisStream.streamName,",
      "KINESIS_STREAM_ARN: kinesisStream.streamArn,",
    ],
    appDeps: ["@aws-sdk/client-kinesis"],
    exampleFile: "apps/server/src/aws/kinesis.ts",
  },
  {
    addon: "aws-eventbridge",
    declarations: [
      "export const awsEventBridge = Effect.gen",
      'AWS.EventBridge.EventBus("event-bus"',
      'AWS.EventBridge.Rule("event-rule"',
    ],
    env: [
      "EVENT_BUS_NAME: eventBus.eventBusName,",
      "EVENT_BUS_ARN: eventBus.eventBusArn,",
      "EVENT_RULE_ARN: eventRule.ruleArn,",
    ],
    appDeps: ["@aws-sdk/client-eventbridge"],
    exampleFile: "apps/server/src/aws/eventbridge.ts",
  },
  {
    addon: "aws-scheduler",
    declarations: [
      'AWS.Scheduler.Schedule("job-schedule"',
      "target: { Arn: serverHost.functionArn, RoleArn: schedulerRole.roleArn },",
    ],
    env: [
      "SCHEDULER_SCHEDULE_NAME: schedule.scheduleName,",
      "SCHEDULER_SCHEDULE_ARN: schedule.scheduleArn,",
    ],
    appDeps: ["@aws-sdk/client-scheduler"],
    exampleFile: "apps/server/src/aws/scheduler.ts",
  },
  {
    addon: "aws-cloudfront",
    declarations: [
      "export const awsCloudfront = Effect.gen",
      'AWS.CloudFront.OriginAccessControl("cdn-origin-access"',
      'AWS.CloudFront.Distribution("cdn"',
    ],
    env: [
      "CLOUDFRONT_DISTRIBUTION_ID: distribution.distributionId,",
      "CLOUDFRONT_URL: distribution.url,",
    ],
    exampleFile: "apps/server/src/aws/cloudfront.ts",
  },
  {
    addon: "aws-elasticache",
    declarations: [
      "export const awsElastiCache = Effect.gen",
      'AWS.ElastiCache.ServerlessCache("cache"',
    ],
    env: [
      "ELASTICACHE_HOST: cache.endpointAddress,",
      "ELASTICACHE_PORT: cache.endpointPort,",
      'ELASTICACHE_TLS: "true",',
    ],
    appDeps: ["ioredis"],
    exampleFile: "apps/server/src/aws/elasticache.ts",
  },
  {
    addon: "aws-bedrock",
    declarations: ['serverHost.bind("aws-bedrock"', '"bedrock:InvokeModel"'],
    env: ['BEDROCK_MODEL_ID: "us.amazon.nova-lite-v1:0",'],
    appDeps: ["ai", "@ai-sdk/amazon-bedrock"],
    exampleFile: "apps/server/src/aws/bedrock.ts",
  },
  {
    addon: "aws-lambda-microvm",
    declarations: [
      "export const awsLambdaMicrovm = Effect.gen",
      'AWS.IAM.Role("microvm-build-role"',
      'AWS.Lambda.MicrovmImage("microvm-image"',
      'context: "../../apps/server/src/aws/microvm"',
    ],
    env: ["MICROVM_IMAGE_ARN: microvmImage.imageArn,"],
    appDeps: ["@aws-sdk/client-lambda-microvms"],
    exampleFile: "apps/server/src/aws/microvm.ts",
  },
];

describe("AWS provider addons", () => {
  for (const testCase of ADDON_CASES) {
    it(`provisions ${testCase.addon} on the deployed server`, async () => {
      const files = await generate({
        projectName: `aws-${testCase.addon}`,
        addons: [testCase.addon],
      });
      const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

      for (const declaration of testCase.declarations) {
        expect(infra).toContain(declaration);
      }
      for (const entry of testCase.env) {
        expect(infra).toContain(entry);
      }
      expect(infra).toContain("const serverHost = yield* AWS.Lambda.Function(");
      expect(infra).toContain(`yield* serverHost.bind("${testCase.addon}"`);
      expect(infra.match(/import \* as AWS from "alchemy\/AWS";/g)).toHaveLength(1);
      expect(files.has(testCase.exampleFile)).toBe(true);

      if (testCase.appDeps) {
        const serverPackage = JSON.parse(files.get("apps/server/package.json") ?? "{}") as {
          dependencies?: Record<string, string>;
        };
        for (const dependency of testCase.appDeps) {
          expect(serverPackage.dependencies?.[dependency]).toBeDefined();
        }
      }
    });
  }

  it("binds every AWS addon onto one Lambda host without duplicate imports", async () => {
    const files = await generate({
      projectName: "aws-combined-addons",
      addons: [
        "aws-s3",
        "aws-sqs",
        "aws-sns",
        "aws-kinesis",
        "aws-eventbridge",
        "aws-scheduler",
        "aws-cloudfront",
        "aws-elasticache",
        "aws-bedrock",
        "aws-lambda-microvm",
      ],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    for (const addon of [
      "aws-s3",
      "aws-sqs",
      "aws-sns",
      "aws-kinesis",
      "aws-eventbridge",
      "aws-scheduler",
      "aws-cloudfront",
      "aws-elasticache",
      "aws-bedrock",
      "aws-lambda-microvm",
    ]) {
      expect(infra).toContain(`yield* serverHost.bind("${addon}"`);
    }
    expect(infra.match(/import \* as Output from "alchemy\/Output";/g)).toHaveLength(1);
    expect(infra.match(/import \* as AWS from "alchemy\/AWS";/g)).toHaveLength(1);
    expect(infra.match(/const serverHost = yield\* AWS\.Lambda\.Function\(/g)).toHaveLength(1);
  });

  it("binds AWS addons onto a Fargate service", async () => {
    const files = await generate({
      projectName: "aws-fargate-addons",
      runtime: "bun",
      addons: ["aws-sqs", "aws-s3"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("const serverHost = yield* AWS.ECS.Service(");
    expect(infra).toContain("return serverHost;");
    expect(infra).toContain('yield* serverHost.bind("aws-sqs"');
    expect(infra).toContain('yield* serverHost.bind("aws-s3"');
    expect(infra).toContain('AWS.SQS.Queue("job-queue"');
    expect(infra).toContain('AWS.S3.Bucket("s3-bucket"');
  });

  it("targets a scheduler queue when the server runs on Fargate", async () => {
    const files = await generate({
      projectName: "aws-fargate-scheduler",
      runtime: "bun",
      addons: ["aws-scheduler"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain('AWS.SQS.Queue("scheduler-target-queue"');
    expect(infra).toContain("Arn: schedulerQueue.queueArn");
    expect(infra).toContain("SCHEDULER_TARGET_QUEUE_URL: schedulerQueue.queueUrl,");
  });

  it("reuses the S3 addon bucket when CloudFront is selected alongside it", async () => {
    const files = await generate({
      projectName: "aws-cloudfront-s3",
      addons: ["aws-s3", "aws-cloudfront"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("const { bucket: cdnBucket } = yield* awsS3;");
    expect(infra).toContain("domainName: cdnBucket.bucketRegionalDomainName,");
    expect(infra.match(/AWS\.S3\.Bucket\(/g)).toHaveLength(1);
    expect(infra).toContain("S3_BUCKET_NAME: s3Bucket.bucketName,");
    expect(infra).toContain("CLOUDFRONT_DISTRIBUTION_ID: distribution.distributionId,");
  });

  it("provisions a private origin bucket when CloudFront is selected alone", async () => {
    const files = await generate({
      projectName: "aws-cloudfront-solo",
      addons: ["aws-cloudfront"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const serverPackage = JSON.parse(files.get("apps/server/package.json") ?? "{}") as {
      dependencies?: Record<string, string>;
    };

    expect(infra).toContain('AWS.S3.Bucket("cdn-bucket"');
    expect(infra).toContain("CLOUDFRONT_BUCKET_NAME: cdnBucket.bucketName,");
    expect(serverPackage.dependencies?.["@aws-sdk/client-s3"]).toBeDefined();
  });

  it("ignores AWS addons when no AWS server target is active", async () => {
    const files = await generate({
      projectName: "aws-inactive-addons",
      serverDeploy: "none",
      runtime: "bun",
      addons: ["aws-s3", "aws-sqs"],
    });

    expect(files.get("packages/infra/alchemy.run.ts")).toBeUndefined();
  });

  it("does not import AWS addon resources into non-AWS deployments", async () => {
    const files = await generate({
      projectName: "aws-addons-cloudflare",
      webDeploy: "cloudflare",
      serverDeploy: "cloudflare",
      runtime: "workers",
      frontend: ["next"],
      addons: ["aws-s3"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("export const server = Cloudflare.Worker(");
    expect(infra).not.toContain("awsS3");
  });
});
