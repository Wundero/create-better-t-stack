import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const awsSqsRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine("export const awsSqs = Effect.gen(function* () {");
    writer.indent(() => {
      writer.writeLine('const queue = yield* AWS.SQS.Queue("job-queue", {});');
      writer.writeLine("return { queue };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { queue: sqsQueue } = yield* awsSqs;");
  },
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-sqs", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => {
            writer.writeLine("SQS_QUEUE_URL: sqsQueue.queueUrl,");
            writer.writeLine("SQS_QUEUE_ARN: sqsQueue.queueArn,");
            writer.writeLine("SQS_QUEUE_NAME: sqsQueue.queueName,");
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
                  'Action: ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],',
                );
                writer.writeLine("Resource: [sqsQueue.queueArn],");
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
    return ["@aws-sdk/client-sqs"];
  },
  exampleTemplatePrefix: "addons/aws-sqs",
};
