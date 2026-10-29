import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const cloudflareContainersRenderer: AddonRenderer = {
  resources(writer) {
    writeObject(
      writer,
      'export const appContainer = Cloudflare.Containers.Container("app-container", {',
      () => {
        writer.writeLine('image: "docker.io/library/nginx:latest",');
        writer.writeLine('className: "AppContainer",');
      },
      "});",
    );
  },
  bindings() {
    return ["CONTAINER: appContainer,"];
  },
  appDeps() {
    return ["@cloudflare/containers"];
  },
  exampleTemplatePrefix: "addons/cloudflare-containers",
};
