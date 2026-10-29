import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const cloudflareQueuesRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine('export const jobQueue = Cloudflare.Queues.Queue("job-queue");');
  },
  stackResources(writer, plan) {
    if (plan.server.target !== "cloudflare") return false;
    writer.writeLine("const jobQueueResource = yield* jobQueue;");
    writeObject(
      writer,
      'yield* Cloudflare.Queues.Consumer("job-queue-consumer", {',
      () => {
        writer.writeLine("queueId: jobQueueResource.queueId,");
        writer.writeLine("scriptName: serverWorker.workerName,");
      },
      "});",
    );
    return true;
  },
  bindings() {
    return ["JOB_QUEUE: jobQueue,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-queues",
};
