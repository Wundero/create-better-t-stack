import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type CreateOptions = Parameters<typeof createVirtual>[0];
type AddonId = NonNullable<CreateOptions["addons"]>[number];

const baseConfig = {
  projectName: "cloudflare-addon",
  webDeploy: "none",
  serverDeploy: "cloudflare",
  backend: "hono",
  runtime: "workers",
  database: "none",
  orm: "none",
  auth: "none",
  payments: "none",
  api: "orpc",
  frontend: ["none"],
  addons: ["none"],
  examples: ["none"],
  dbSetup: "none",
  install: false,
  git: false,
  packageManager: "bun",
} satisfies CreateOptions;

async function generate(overrides: Partial<CreateOptions>) {
  const result = await createVirtual({ ...baseConfig, ...overrides });
  if (result.isErr()) throw result.error;
  return collectFiles(result.value.root, result.value.root.path);
}

type AddonCase = {
  addon: AddonId;
  declarations: string[];
  binding: string;
  appDeps?: string[];
};

const ADDON_CASES: AddonCase[] = [
  {
    addon: "cloudflare-durable-objects",
    declarations: ['Cloudflare.Workers.DurableObject("counter"'],
    binding: "COUNTER: counter,",
  },
  {
    addon: "cloudflare-containers",
    declarations: ['Cloudflare.Containers.Container("app-container"'],
    binding: "CONTAINER: appContainer,",
    appDeps: ["@cloudflare/containers"],
  },
  {
    addon: "cloudflare-sandboxes",
    declarations: ['Cloudflare.Containers.Container("sandbox"'],
    binding: "SANDBOX: sandbox,",
    appDeps: ["@cloudflare/sandbox"],
  },
  {
    addon: "cloudflare-r2",
    declarations: ['Cloudflare.R2.Bucket("r2-bucket"'],
    binding: "R2_BUCKET: r2Bucket,",
  },
  {
    addon: "cloudflare-kv",
    declarations: ['Cloudflare.KV.Namespace("kv-namespace"'],
    binding: "KV_NAMESPACE: kvNamespace,",
  },
  {
    addon: "cloudflare-queues",
    declarations: ['Cloudflare.Queues.Queue("job-queue"'],
    binding: "JOB_QUEUE: jobQueue,",
  },
  {
    addon: "cloudflare-workers-ai",
    declarations: [],
    binding: "AI: Cloudflare.Workers.AI(),",
    appDeps: ["ai", "workers-ai-provider"],
  },
  {
    addon: "cloudflare-ai-search",
    declarations: ['Cloudflare.R2.Bucket("ai-search-source"', 'Cloudflare.AI.Search("ai-search"'],
    binding: "AI_SEARCH: aiSearch,",
  },
  {
    addon: "cloudflare-flagship",
    declarations: [
      'Cloudflare.Flagship.App("feature-flags"',
      'Cloudflare.Flagship.Flag("new-checkout"',
    ],
    binding: "FEATURE_FLAGS: featureFlags,",
  },
  {
    addon: "cloudflare-pipelines",
    declarations: [
      'Cloudflare.Pipelines.Stream("events"',
      'Cloudflare.Pipelines.Sink("events-sink"',
      'Cloudflare.Pipelines.Pipeline("events-pipeline"',
    ],
    binding: "PIPELINES: pipelines,",
  },
  {
    addon: "cloudflare-stream",
    declarations: [],
    binding: "STREAM: Cloudflare.Stream.Stream(),",
  },
  {
    addon: "cloudflare-realtime-kit",
    declarations: ['Cloudflare.RealtimeKit.App("realtime-kit"'],
    binding: "REALTIME_KIT_APP_ID: realtimeKitAppId,",
  },
];

describe("Cloudflare provider addons", () => {
  for (const testCase of ADDON_CASES) {
    it(`provisions ${testCase.addon} on the server Worker`, async () => {
      const files = await generate({
        projectName: `cf-${testCase.addon}`,
        addons: [testCase.addon],
      });
      const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

      for (const declaration of testCase.declarations) {
        expect(infra).toContain(declaration);
      }
      expect(infra).toContain(testCase.binding);
      expect(infra.match(/import \* as Cloudflare from "alchemy\/Cloudflare";/g)).toHaveLength(1);

      if (testCase.appDeps) {
        const serverPackage = JSON.parse(files.get("apps/server/package.json") ?? "{}") as {
          dependencies?: Record<string, string>;
        };
        for (const dependency of testCase.appDeps) {
          expect(serverPackage.dependencies?.[dependency]).toBeDefined();
        }
      }
    });
  }

  it("binds Cloudflare addons to the self-hosted web Worker", async () => {
    const files = await generate({
      projectName: "cf-self-addons",
      frontend: ["next"],
      backend: "self",
      runtime: "none",
      database: "postgres",
      orm: "prisma",
      dbSetup: "neon",
      webDeploy: "cloudflare",
      serverDeploy: "none",
      addons: ["cloudflare-r2", "cloudflare-kv"],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";

    expect(infra).toContain("export const web = Cloudflare.");
    expect(infra).toContain("R2_BUCKET: r2Bucket,");
    expect(infra).toContain("KV_NAMESPACE: kvNamespace,");
  });

  it("combines several Cloudflare addons without dropping declarations or bindings", async () => {
    const files = await generate({
      projectName: "cf-combined-addons",
      addons: [
        "cloudflare-r2",
        "cloudflare-kv",
        "cloudflare-queues",
        "cloudflare-workers-ai",
        "cloudflare-ai-search",
        "cloudflare-stream",
      ],
    });
    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const serverPackage = JSON.parse(files.get("apps/server/package.json") ?? "{}") as {
      dependencies?: Record<string, string>;
    };

    for (const binding of [
      "R2_BUCKET: r2Bucket,",
      "KV_NAMESPACE: kvNamespace,",
      "JOB_QUEUE: jobQueue,",
      "AI: Cloudflare.Workers.AI(),",
      "AI_SEARCH: aiSearch,",
      "STREAM: Cloudflare.Stream.Stream(),",
    ]) {
      expect(infra).toContain(binding);
    }
    expect(infra).toContain('Cloudflare.AI.Search("ai-search"');
    expect(infra.match(/import \* as Cloudflare from "alchemy\/Cloudflare";/g)).toHaveLength(1);
    expect(serverPackage.dependencies?.["workers-ai-provider"]).toBeDefined();
  });

  it("ignores Cloudflare addons when no Cloudflare target is active", async () => {
    const files = await generate({
      projectName: "cf-inactive-addons",
      serverDeploy: "none",
      webDeploy: "none",
      runtime: "bun",
      addons: ["cloudflare-r2", "cloudflare-kv"],
    });

    expect(files.get("packages/infra/alchemy.run.ts")).toBeUndefined();
  });
});
