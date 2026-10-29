import { writeObject, type AlchemyWriter } from "../../writer";
import type { AddonRenderer } from "../types";

const IMAGE_GLOB_REPLACEMENT = ":microvm-image[:/].*$";

function writeMicrovmPolicy(writer: AlchemyWriter): void {
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
              writer.writeLine('"lambda:RunMicrovm",');
              writer.writeLine('"lambda:GetMicrovm",');
              writer.writeLine('"lambda:TerminateMicrovm",');
              writer.writeLine('"lambda:CreateMicrovmAuthToken",');
              writer.writeLine('"lambda:ResumeMicrovm",');
              writer.writeLine('"lambda:SuspendMicrovm",');
            },
            "],",
          );
          writeObject(
            writer,
            "Resource: [",
            () => {
              writer.writeLine("microvmImage.imageArn,");
              writer.writeLine(
                `microvmImage.imageArn.pipe(Output.map((arn) => \`\${arn.replace(/${IMAGE_GLOB_REPLACEMENT}/, "")}:microvm:*\`)),`,
              );
            },
            "],",
          );
        },
        "},",
      );
      writeObject(
        writer,
        "{",
        () => {
          writer.writeLine('Effect: "Allow",');
          writer.writeLine('Action: ["lambda:PassNetworkConnector"],');
          writeObject(
            writer,
            "Resource: [",
            () => {
              writer.writeLine(
                `microvmImage.imageArn.pipe(Output.map((arn) => \`\${arn.replace(/${IMAGE_GLOB_REPLACEMENT}/, "")}:network-connector:*\`)),`,
              );
              writer.writeLine(
                `microvmImage.imageArn.pipe(Output.map((arn) => \`\${arn.replace(/${IMAGE_GLOB_REPLACEMENT}/, "").replace(/:[^:]*$/, "")}:aws:network-connector:*\`)),`,
              );
            },
            "],",
          );
        },
        "},",
      );
    },
    "],",
  );
}

export const awsLambdaMicrovmRenderer: AddonRenderer = {
  imports() {
    return ['import * as Output from "alchemy/Output";'];
  },
  resources(writer) {
    writer.writeLine("export const awsLambdaMicrovm = Effect.gen(function* () {");
    writer.indent(() => {
      writer.writeLine('const buildRole = yield* AWS.IAM.Role("microvm-build-role", {});');
      writeObject(
        writer,
        'const image = yield* AWS.Lambda.MicrovmImage("microvm-image", {',
        () => {
          writer.writeLine('context: "../../apps/server/src/aws/microvm",');
          writer.writeLine("buildRole,");
        },
        "});",
      );
      writer.writeLine("return { image };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { image: microvmImage } = yield* awsLambdaMicrovm;");
  },
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-lambda-microvm", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => writer.writeLine("MICROVM_IMAGE_ARN: microvmImage.imageArn,"),
          "},",
        );
        writeMicrovmPolicy(writer);
      },
      "});",
    );
  },
  appDeps() {
    return ["@aws-sdk/client-lambda-microvms"];
  },
  exampleTemplatePrefix: "addons/aws-lambda-microvm",
};
