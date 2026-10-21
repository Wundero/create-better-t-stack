import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const cloudflarePipelinesRenderer: AddonRenderer = {
  imports() {
    return ['import * as Output from "alchemy/Output";'];
  },
  resources(writer) {
    writer.writeLine("export const pipelines = Effect.gen(function* () {");
    writer.indent(() => {
      writer.writeLine('const bucket = yield* Cloudflare.R2.Bucket("pipeline-bucket");');
      writer.writeLine('const stream = yield* Cloudflare.Pipelines.Stream("events");');
      writeObject(
        writer,
        'const sink = yield* Cloudflare.Pipelines.Sink("events-sink", {',
        () => {
          writer.writeLine('type: "r2",');
          writeObject(
            writer,
            "config: {",
            () => {
              writer.writeLine("bucket: bucket.bucketName,");
              writeObject(
                writer,
                "credentials: {",
                () => {
                  writer.writeLine('accessKeyId: yield* Config.Redacted("R2_ACCESS_KEY_ID"),');
                  writer.writeLine(
                    'secretAccessKey: yield* Config.Redacted("R2_SECRET_ACCESS_KEY"),',
                  );
                },
                "},",
              );
            },
            "},",
          );
        },
        "});",
      );
      writer.blankLine();
      writeObject(
        writer,
        'yield* Cloudflare.Pipelines.Pipeline("events-pipeline", {',
        () =>
          writer.writeLine(
            "sql: Output.interpolate`INSERT INTO ${sink.name} SELECT * FROM ${stream.name}`,",
          ),
        "});",
      );
      writer.blankLine();
      writer.writeLine("return stream;");
    });
    writer.writeLine("});");
  },
  bindings() {
    return ["PIPELINES: pipelines,"];
  },
  exampleTemplatePrefix: "addons/cloudflare-pipelines",
};
