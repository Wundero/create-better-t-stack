import { ENV } from "../env.server";

export function isNewCheckoutEnabled(userId: string) {
  return ENV.FEATURE_FLAGS.getBooleanValue("new-checkout", false, { userId });
}
