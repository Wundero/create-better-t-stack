import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const cloudflareFlagshipRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine("export const featureFlags = Effect.gen(function* () {");
    writer.indent(() => {
      writer.writeLine('const app = yield* Cloudflare.Flagship.App("feature-flags");');
      writer.blankLine();
      writeObject(
        writer,
        'yield* Cloudflare.Flagship.Flag("new-checkout", {',
        () => {
          writer.writeLine("appId: app.appId,");
          writer.writeLine('key: "new-checkout",');
          writer.writeLine('defaultVariation: "off",');
          writeObject(
            writer,
            "variations: {",
            () => {
              writer.writeLine("off: false,");
              writer.writeLine("on: true,");
            },
            "},",
          );
        },
        "});",
      );
      writer.blankLine();
      writer.writeLine("return app;");
    });
    writer.writeLine("});");
  },
  bindings() {
    return ["FEATURE_FLAGS: featureFlags,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-flagship",
};
