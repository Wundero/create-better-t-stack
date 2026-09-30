import type { AddonRenderer } from "../types";

export const cloudflareStreamRenderer: AddonRenderer = {
  bindings() {
    return ["STREAM: Cloudflare.Stream.Stream(),"];
  },
  exampleTemplatePrefix: "addons/cloudflare-stream",
};
