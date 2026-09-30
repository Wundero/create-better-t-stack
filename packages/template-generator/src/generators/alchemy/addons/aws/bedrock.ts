import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

const DEFAULT_MODEL_ID = "us.amazon.nova-lite-v1:0";

export const awsBedrockRenderer: AddonRenderer = {
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-bedrock", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => writer.writeLine(`BEDROCK_MODEL_ID: "${DEFAULT_MODEL_ID}",`),
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
                writeObject(
                  writer,
                  "Action: [",
                  () => {
                    writer.writeLine('"bedrock:InvokeModel",');
                    writer.writeLine('"bedrock:InvokeModelWithResponseStream",');
                    writer.writeLine('"bedrock:Converse",');
                    writer.writeLine('"bedrock:ConverseStream",');
                  },
                  "],",
                );
                writeObject(
                  writer,
                  "Resource: [",
                  () => {
                    writer.writeLine('"arn:aws:bedrock:*::foundation-model/*",');
                    writer.writeLine('"arn:aws:bedrock:*:*:inference-profile/*",');
                  },
                  "],",
                );
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
    return ["ai", "@ai-sdk/amazon-bedrock"];
  },
  exampleTemplatePrefix: "addons/aws-bedrock",
};
