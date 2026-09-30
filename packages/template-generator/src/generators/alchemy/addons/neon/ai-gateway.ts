import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const neonAiGatewayRenderer: AddonRenderer = {
  imports() {
    return ['import * as Neon from "alchemy/Neon";'];
  },
  resources(writer) {
    writer.writeLine("export const neonAiGateway = Effect.gen(function* () {");
    writer.indent(() => {
      writeObject(
        writer,
        'return yield* Neon.AIGateway("ai-gateway", {',
        () => {
          writer.writeLine("branch: neonBranch,");
        },
        "});",
      );
    });
    writer.writeLine("});");
  },
  serverPrelude(writer) {
    writer.writeLine("yield* neonAiGateway;");
  },
  appDeps() {
    return ["ai", "@neon/ai-sdk-provider"];
  },
  exampleTemplatePrefix: "addons/neon-ai-gateway",
};
