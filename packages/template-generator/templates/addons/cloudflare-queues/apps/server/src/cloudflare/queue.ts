import { ENV } from "../env.server";

export function enqueueJob(job: string) {
  return ENV.JOB_QUEUE.send(job);
}
