import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const cloudflareSandboxesRenderer: AddonRenderer = {
  resources(writer) {
    writeObject(
      writer,
      'export const sandbox = Cloudflare.Containers.Container("sandbox", {',
      () => {
        writer.writeLine('image: "docker.io/cloudflare/sandbox:0.1.3",');
        writer.writeLine('className: "Sandbox",');
      },
      "});",
    );
  },
  bindings() {
    return ["SANDBOX: sandbox,"];
  },
  appDeps() {
    return ["@cloudflare/sandbox"];
  },
  exampleTemplatePrefix: "addons/cloudflare-sandboxes",
};
