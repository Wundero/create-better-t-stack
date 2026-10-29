import type { AddonRenderer } from "../types";

export const cloudflareR2Renderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine('export const r2Bucket = Cloudflare.R2.Bucket("r2-bucket");');
  },
  bindings() {
    return ["R2_BUCKET: r2Bucket,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-r2",
};
