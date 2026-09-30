import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const awsKinesisRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine("export const awsKinesis = Effect.gen(function* () {");
    writer.indent(() => {
      writeObject(
        writer,
        'const stream = yield* AWS.Kinesis.Stream("event-stream", {',
        () => writer.writeLine('streamMode: "ON_DEMAND",'),
        "});",
      );
      writer.writeLine("return { stream };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { stream: kinesisStream } = yield* awsKinesis;");
  },
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-kinesis", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => {
            writer.writeLine("KINESIS_STREAM_NAME: kinesisStream.streamName,");
            writer.writeLine("KINESIS_STREAM_ARN: kinesisStream.streamArn,");
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
                writer.writeLine(
                  'Action: ["kinesis:PutRecord", "kinesis:PutRecords", "kinesis:DescribeStream", "kinesis:DescribeStreamSummary", "kinesis:GetShardIterator", "kinesis:GetRecords"],',
                );
                writer.writeLine("Resource: [kinesisStream.streamArn],");
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
    return ["@aws-sdk/client-kinesis"];
  },
  exampleTemplatePrefix: "addons/aws-kinesis",
};
