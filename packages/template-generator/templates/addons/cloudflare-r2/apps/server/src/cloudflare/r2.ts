import { ENV } from "../env.server";

export function putAsset(key: string, value: string) {
  return ENV.R2_BUCKET.put(key, value);
}
