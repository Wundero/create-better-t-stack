import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const client = new SNSClient({});

export function publishNotification(message: string) {
  return client.send(
    new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN!,
      Message: message,
    }),
  );
}
