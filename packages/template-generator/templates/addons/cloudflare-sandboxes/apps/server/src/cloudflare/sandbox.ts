import { getSandbox } from "@cloudflare/sandbox";

import { ENV } from "../env.server";

export { Sandbox } from "@cloudflare/sandbox";

export function getAppSandbox(id = "default") {
  return getSandbox(ENV.SANDBOX, id);
}
