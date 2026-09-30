import { ENV } from "../env.server";

export function sendEvent(event: string) {
  return ENV.PIPELINES.send([{ event, at: new Date().toISOString() }]);
}
