import { LambdaMicrovmsClient, RunMicrovmCommand } from "@aws-sdk/client-lambda-microvms";

const client = new LambdaMicrovmsClient({});

export function runSandbox() {
  return client.send(
    new RunMicrovmCommand({
      imageIdentifier: process.env.MICROVM_IMAGE_ARN!,
      idlePolicy: {
        maxIdleDurationSeconds: 900,
        suspendedDurationSeconds: 300,
        autoResumeEnabled: true,
      },
    }),
  );
}
