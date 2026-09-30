import type { AlchemyDeploymentPlan } from "../../plan";
import { writeObject, type AlchemyWriter } from "../../writer";
import type { AddonRenderer } from "../types";

function usesSharedBucket(plan: AlchemyDeploymentPlan): boolean {
  return plan.config.addons.includes("aws-s3");
}

function writeBucket(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (usesSharedBucket(plan)) {
    writer.writeLine("const { bucket: cdnBucket } = yield* awsS3;");
    return;
  }
  writeObject(
    writer,
    'const cdnBucket = yield* AWS.S3.Bucket("cdn-bucket", {',
    () => writer.writeLine("forceDestroy: true,"),
    "});",
  );
}

function writeDistribution(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  const { projectName } = plan.config;
  writeObject(
    writer,
    'const originAccessControl = yield* AWS.CloudFront.OriginAccessControl("cdn-origin-access", {',
    () => {
      writer.writeLine('originType: "s3",');
      writer.writeLine(`description: "${projectName} CDN origin access control",`);
    },
    "});",
  );
  writeObject(
    writer,
    'const distribution = yield* AWS.CloudFront.Distribution("cdn", {',
    () => {
      writeObject(
        writer,
        "origins: [",
        () => {
          writeObject(
            writer,
            "{",
            () => {
              writer.writeLine('id: "s3-origin",');
              writer.writeLine("domainName: cdnBucket.bucketRegionalDomainName,");
              writer.writeLine("s3Origin: true,");
              writer.writeLine("originAccessControlId: originAccessControl.originAccessControlId,");
            },
            "},",
          );
        },
        "],",
      );
      writeObject(
        writer,
        "defaultCacheBehavior: {",
        () => {
          writer.writeLine('targetOriginId: "s3-origin",');
          writer.writeLine('viewerProtocolPolicy: "redirect-to-https",');
          writer.writeLine('allowedMethods: ["GET", "HEAD", "OPTIONS"],');
          writer.writeLine('cachedMethods: ["GET", "HEAD"],');
          writer.writeLine("compress: true,");
          writer.writeLine("cachePolicyId: AWS.CloudFront.MANAGED_CACHING_OPTIMIZED_POLICY_ID,");
        },
        "},",
      );
      writer.writeLine(`comment: "${projectName} CDN",`);
    },
    "});",
  );
  writer.writeLine("yield* cdnBucket.bind`AWS.S3.Policy(CloudFront, ${cdnBucket})`({");
  writer.indent(() => {
    writeObject(
      writer,
      "policyStatements: [",
      () => {
        writeObject(
          writer,
          "{",
          () => {
            writer.writeLine('Effect: "Allow",');
            writer.writeLine('Principal: { Service: "cloudfront.amazonaws.com" },');
            writer.writeLine('Action: ["s3:GetObject"],');
            writer.writeLine("Resource: [Output.interpolate`${cdnBucket.bucketArn}/*`],");
            writeObject(
              writer,
              "Condition: {",
              () => {
                writeObject(
                  writer,
                  "StringEquals: {",
                  () => writer.writeLine('"AWS:SourceArn": distribution.distributionArn,'),
                  "},",
                );
              },
              "},",
            );
          },
          "},",
        );
      },
      "],",
    );
  });
  writer.writeLine("});");
}

export const awsCloudfrontRenderer: AddonRenderer = {
  imports() {
    return ['import * as Output from "alchemy/Output";'];
  },
  resources(writer, plan) {
    writer.writeLine("export const awsCloudfront = Effect.gen(function* () {");
    writer.indent(() => {
      writeBucket(writer, plan);
      writeDistribution(writer, plan);
      writer.writeLine("return { distribution, bucket: cdnBucket };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { distribution, bucket: cdnBucket } = yield* awsCloudfront;");
  },
  hostBindings(writer, plan) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-cloudfront", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => {
            writer.writeLine("CLOUDFRONT_DISTRIBUTION_ID: distribution.distributionId,");
            writer.writeLine("CLOUDFRONT_URL: distribution.url,");
            if (!usesSharedBucket(plan)) {
              writer.writeLine("CLOUDFRONT_BUCKET_NAME: cdnBucket.bucketName,");
            }
          },
          "},",
        );
        if (usesSharedBucket(plan)) return;
        writeObject(
          writer,
          "policyStatements: [",
          () => {
            writeObject(
              writer,
              "{",
              () => {
                writer.writeLine('Effect: "Allow",');
                writer.writeLine('Action: ["s3:PutObject", "s3:DeleteObject"],');
                writer.writeLine("Resource: [Output.interpolate`${cdnBucket.bucketArn}/*`],");
              },
              "},",
            );
          },
          "],",
        );
      },
      "});",
    );
  },
  appDeps(plan) {
    return usesSharedBucket(plan) ? [] : ["@aws-sdk/client-s3"];
  },
  exampleTemplatePrefix: "addons/aws-cloudfront",
};
