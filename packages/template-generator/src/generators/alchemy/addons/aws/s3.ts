import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const awsS3Renderer: AddonRenderer = {
  imports() {
    return ['import * as Output from "alchemy/Output";'];
  },
  resources(writer) {
    writer.writeLine("export const awsS3 = Effect.gen(function* () {");
    writer.indent(() => {
      writeObject(
        writer,
        'const bucket = yield* AWS.S3.Bucket("s3-bucket", {',
        () => writer.writeLine("forceDestroy: true,"),
        "});",
      );
      writer.writeLine("return { bucket };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { bucket: s3Bucket } = yield* awsS3;");
  },
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-s3", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => {
            writer.writeLine("S3_BUCKET_NAME: s3Bucket.bucketName,");
            writer.writeLine("S3_BUCKET_ARN: s3Bucket.bucketArn,");
          },
          "},",
        );
        writeObject(
          writer,
          "policyStatements: [",
          () => {
            writeObject(
              writer,
              "{",
              () => {
                writer.writeLine('Effect: "Allow",');
                writer.writeLine('Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],');
                writer.writeLine("Resource: [Output.interpolate`${s3Bucket.bucketArn}/*`],");
              },
              "},",
            );
            writeObject(
              writer,
              "{",
              () => {
                writer.writeLine('Effect: "Allow",');
                writer.writeLine('Action: ["s3:ListBucket"],');
                writer.writeLine("Resource: [s3Bucket.bucketArn],");
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
  appDeps() {
    return ["@aws-sdk/client-s3"];
  },
  exampleTemplatePrefix: "addons/aws-s3",
};
