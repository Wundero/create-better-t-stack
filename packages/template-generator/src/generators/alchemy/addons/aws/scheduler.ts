import type { AlchemyDeploymentPlan } from "../../plan";
import { writeObject, type AlchemyWriter } from "../../writer";
import type { AddonRenderer } from "../types";

const SCHEDULE_EXPRESSION = "rate(5 minutes)";

function writeAssumeRolePolicy(writer: AlchemyWriter): void {
  writeObject(
    writer,
    "assumeRolePolicyDocument: {",
    () => {
      writer.writeLine('Version: "2012-10-17",');
      writeObject(
        writer,
        "Statement: [",
        () => {
          writeObject(
            writer,
            "{",
            () => {
              writer.writeLine('Effect: "Allow",');
              writer.writeLine('Principal: { Service: "scheduler.amazonaws.com" },');
              writer.writeLine('Action: ["sts:AssumeRole"],');
            },
            "},",
          );
        },
        "],",
      );
    },
    "},",
  );
}

function writeInlinePolicy(
  writer: AlchemyWriter,
  name: string,
  action: string,
  resource: string,
): void {
  writeObject(
    writer,
    "inlinePolicies: {",
    () => {
      writeObject(
        writer,
        `${name}: {`,
        () => {
          writer.writeLine('Version: "2012-10-17",');
          writeObject(
            writer,
            "Statement: [",
            () => {
              writeObject(
                writer,
                "{",
                () => {
                  writer.writeLine('Effect: "Allow",');
                  writer.writeLine(`Action: ["${action}"],`);
                  writer.writeLine(`Resource: [${resource}],`);
                },
                "},",
              );
            },
            "],",
          );
        },
        "},",
      );
    },
    "},",
  );
}

function writeScheduleTarget(writer: AlchemyWriter, arn: string): void {
  writeObject(
    writer,
    'const schedule = yield* AWS.Scheduler.Schedule("job-schedule", {',
    () => {
      writer.writeLine(`scheduleExpression: "${SCHEDULE_EXPRESSION}",`);
      writer.writeLine('flexibleTimeWindow: { Mode: "OFF" },');
      writer.writeLine(`target: { Arn: ${arn}, RoleArn: schedulerRole.roleArn },`);
    },
    "});",
  );
}

function writeScheduleEnv(
  writer: AlchemyWriter,
  entries: readonly string[],
  policy?: { action: string; resource: string },
): void {
  writeObject(
    writer,
    'yield* serverHost.bind("aws-scheduler", {',
    () => {
      writeObject(
        writer,
        "env: {",
        () => {
          writer.writeLine("SCHEDULER_SCHEDULE_NAME: schedule.scheduleName,");
          writer.writeLine("SCHEDULER_SCHEDULE_ARN: schedule.scheduleArn,");
          for (const entry of entries) writer.writeLine(entry);
        },
        "},",
      );
      if (!policy) return;
      writeObject(
        writer,
        "policyStatements: [",
        () => {
          writeObject(
            writer,
            "{",
            () => {
              writer.writeLine('Effect: "Allow",');
              writer.writeLine(`Action: ["${policy.action}"],`);
              writer.writeLine(`Resource: [${policy.resource}],`);
            },
            "},",
          );
        },
        "],",
      );
    },
    "});",
  );
}

function writeLambdaSchedule(writer: AlchemyWriter): void {
  writeObject(
    writer,
    'const schedulerRole = yield* AWS.IAM.Role("scheduler-role", {',
    () => {
      writeAssumeRolePolicy(writer);
      writeInlinePolicy(writer, "InvokeServer", "lambda:InvokeFunction", "serverHost.functionArn");
    },
    "});",
  );
  writeScheduleTarget(writer, "serverHost.functionArn");
  writeScheduleEnv(writer, []);
}

function writeFargateSchedule(writer: AlchemyWriter): void {
  writer.writeLine('const schedulerQueue = yield* AWS.SQS.Queue("scheduler-target-queue", {});');
  writeObject(
    writer,
    'const schedulerRole = yield* AWS.IAM.Role("scheduler-role", {',
    () => {
      writeAssumeRolePolicy(writer);
      writeInlinePolicy(writer, "SendToQueue", "sqs:SendMessage", "schedulerQueue.queueArn");
    },
    "});",
  );
  writeScheduleTarget(writer, "schedulerQueue.queueArn");
  writeScheduleEnv(writer, ["SCHEDULER_TARGET_QUEUE_URL: schedulerQueue.queueUrl,"], {
    action: "sqs:ReceiveMessage",
    resource: "schedulerQueue.queueArn",
  });
}

function scheduleOnFargate(plan: AlchemyDeploymentPlan): boolean {
  return plan.server.target === "aws" && plan.server.compute === "fargate";
}

export const awsSchedulerRenderer: AddonRenderer = {
  hostBindings(writer, plan) {
    if (scheduleOnFargate(plan)) writeFargateSchedule(writer);
    else writeLambdaSchedule(writer);
  },
  appDeps() {
    return ["@aws-sdk/client-scheduler"];
  },
  exampleTemplatePrefix: "addons/aws-scheduler",
};
