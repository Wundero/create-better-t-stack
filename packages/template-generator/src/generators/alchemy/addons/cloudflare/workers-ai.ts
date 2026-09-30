import type { AddonRenderer } from "../types";

export const cloudflareWorkersAiRenderer: AddonRenderer = {
  bindings() {
    return ["AI: Cloudflare.Workers.AI(),"];
  },
  appDeps() {
    return ["ai", "workers-ai-provider"];
  },
  exampleTemplatePrefix: "addons/cloudflare-workers-ai",
};
