import type { AddonRenderer } from "../types";

export const cloudflareQueuesRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine('export const jobQueue = Cloudflare.Queues.Queue("job-queue");');
  },
  bindings() {
    return ["JOB_QUEUE: jobQueue,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-queues",
};
