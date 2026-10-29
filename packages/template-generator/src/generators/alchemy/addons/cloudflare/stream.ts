import type { AddonRenderer } from "../types";

export const cloudflareStreamRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine(
      'export const streamLiveInput = Cloudflare.Stream.LiveInput("stream-live-input");',
    );
  },
  bindings() {
    return ["STREAM: Cloudflare.Stream.Stream(),"];
  },
  env() {
    return ["STREAM_LIVE_INPUT_ID: streamLiveInput.liveInputId,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-stream",
};
