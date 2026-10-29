import type { AddonRenderer } from "../types";

export const cloudflareRealtimeKitRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine('export const realtimeKit = Cloudflare.RealtimeKit.App("realtime-kit");');
    writer.blankLine();
    writer.writeLine(
      "export const realtimeKitAppId = realtimeKit.pipe(Effect.map((app) => app.appId));",
    );
  },
  bindings() {
    return ["REALTIME_KIT_APP_ID: realtimeKitAppId,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-realtime-kit",
};
