import { ENV } from "../env.server";

export function readValue(key: string) {
  return ENV.KV_NAMESPACE.get(key);
}
