import { writeObject } from "../../writer";
import type { AddonRenderer } from "../types";

export const neonBucketsRenderer: AddonRenderer = {
  imports() {
    return ['import * as Neon from "alchemy/Neon";'];
  },
  resources(writer) {
    writer.writeLine("export const neonBuckets = Effect.flatMap(neonBranch, (neonBranch) =>");
    writer.indent(() => {
      writeObject(
        writer,
        'Neon.Bucket("bucket", {',
        () => {
          writer.writeLine("branch: neonBranch,");
          writer.writeLine("forceDestroy: true,");
        },
        "}).pipe(Effect.map((bucket) => ({ bucket }))),",
      );
    });
    writer.writeLine(");");
  },
  serverPrelude(writer) {
    writer.writeLine("const { bucket: neonBucket } = yield* neonBuckets;");
  },
  env() {
    return ["S3_BUCKET_NAME: neonBucket.bucketName,"];
  },
  appDeps() {
    return ["@aws-sdk/client-s3"];
  },
  exampleTemplatePrefix: "addons/neon-buckets",
};
