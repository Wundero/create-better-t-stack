import { ENV } from "../env.server";

type QueueMessage = {
  body: unknown;
  ack(): void;
  retry(): void;
};

type QueueBatch = {
  messages: QueueMessage[];
};

export function enqueueJob(job: string) {
  return ENV.JOB_QUEUE.send(job);
}

export async function handleQueue(batch: QueueBatch): Promise<void> {
  for (const message of batch.messages) {
    console.log("Processing job", message.body);
    message.ack();
  }
}
