import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const cloudflareDurableObjectsRenderer: AddonRenderer = {
  resources(writer) {
    writeObject(
      writer,
      'export const counter = Cloudflare.Workers.DurableObject("counter", {',
      () => writer.writeLine('className: "Counter",'),
      "});",
    );
  },
  bindings() {
    return ["COUNTER: counter,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-durable-objects",
};
