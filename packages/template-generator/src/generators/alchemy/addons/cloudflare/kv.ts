import type { AddonRenderer } from "../types";

export const cloudflareKvRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine('export const kvNamespace = Cloudflare.KV.Namespace("kv-namespace");');
  },
  bindings() {
    return ["KV_NAMESPACE: kvNamespace,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-kv",
};
