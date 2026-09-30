import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const awsSnsRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine("export const awsSns = Effect.gen(function* () {");
    writer.indent(() => {
      writeObject(
        writer,
        'const topic = yield* AWS.SNS.Topic("notifications-topic", {',
        () => writer.writeLine('attributes: { DisplayName: "Notifications" },'),
        "});",
      );
      writer.writeLine("return { topic };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { topic: snsTopic } = yield* awsSns;");
  },
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-sns", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => {
            writer.writeLine("SNS_TOPIC_ARN: snsTopic.topicArn,");
            writer.writeLine("SNS_TOPIC_NAME: snsTopic.topicName,");
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
                writer.writeLine('Action: ["sns:Publish"],');
                writer.writeLine("Resource: [snsTopic.topicArn],");
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
    return ["@aws-sdk/client-sns"];
  },
  exampleTemplatePrefix: "addons/aws-sns",
};
