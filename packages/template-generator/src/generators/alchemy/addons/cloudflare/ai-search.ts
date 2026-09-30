import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const cloudflareAiSearchRenderer: AddonRenderer = {
  resources(writer) {
    writer.writeLine("export const aiSearch = Effect.gen(function* () {");
    writer.indent(() => {
      writer.writeLine('const source = yield* Cloudflare.R2.Bucket("ai-search-source");');
      writer.blankLine();
      writeObject(
        writer,
        'return yield* Cloudflare.AI.Search("ai-search", {',
        () => writer.writeLine("source,"),
        "});",
      );
    });
    writer.writeLine("});");
  },
  bindings() {
    return ["AI_SEARCH: aiSearch,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-ai-search",
};
