import { getSandbox, type Sandbox } from "@cloudflare/sandbox";

import { ENV } from "../env.server";

export { Sandbox } from "@cloudflare/sandbox";

export function getAppSandbox(id = "default") {
  return getSandbox(ENV.SANDBOX as DurableObjectNamespace<Sandbox>, id);
}
