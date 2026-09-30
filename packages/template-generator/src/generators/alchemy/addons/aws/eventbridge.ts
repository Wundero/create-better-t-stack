import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const awsEventBridgeRenderer: AddonRenderer = {
  resources(writer, plan) {
    const { projectName } = plan.config;
    writer.writeLine("export const awsEventBridge = Effect.gen(function* () {");
    writer.indent(() => {
      writeObject(
        writer,
        'const eventBus = yield* AWS.EventBridge.EventBus("event-bus", {',
        () => writer.writeLine(`description: "${projectName} application event bus",`),
        "});",
      );
      writer.writeLine("// Attach targets (Lambda, SQS, ...) to route matching events.");
      writeObject(
        writer,
        'const rule = yield* AWS.EventBridge.Rule("event-rule", {',
        () => {
          writer.writeLine("eventBusName: eventBus.eventBusName,");
          writer.writeLine(`eventPattern: { source: ["${projectName}.app"] },`);
          writer.writeLine(`description: "Routes ${projectName} application events",`);
        },
        "});",
      );
      writer.writeLine("return { eventBus, rule };");
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("const { eventBus, rule: eventRule } = yield* awsEventBridge;");
  },
  hostBindings(writer) {
    writeObject(
      writer,
      'yield* serverHost.bind("aws-eventbridge", {',
      () => {
        writeObject(
          writer,
          "env: {",
          () => {
            writer.writeLine("EVENT_BUS_NAME: eventBus.eventBusName,");
            writer.writeLine("EVENT_BUS_ARN: eventBus.eventBusArn,");
            writer.writeLine("EVENT_RULE_NAME: eventRule.ruleName,");
            writer.writeLine("EVENT_RULE_ARN: eventRule.ruleArn,");
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
                writer.writeLine('Action: ["events:PutEvents"],');
                writer.writeLine("Resource: [eventBus.eventBusArn],");
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
    return ["@aws-sdk/client-eventbridge"];
  },
  exampleTemplatePrefix: "addons/aws-eventbridge",
};
