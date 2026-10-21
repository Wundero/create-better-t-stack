import { describe, expect, it } from "bun:test";

import type { ProjectConfig } from "@better-t-stack/types";

import {
  activeAddons,
  ADDON_RENDERERS,
  addonBindings,
  addonEnv,
  addonInfraDeps,
  hasAddonRenderers,
  writeAddonImports,
  writeAddonResources,
} from "../../../packages/template-generator/src/generators/alchemy/addons";
import { createAlchemyDeploymentPlan } from "../../../packages/template-generator/src/generators/alchemy/plan";
import { createAlchemyWriter } from "../../../packages/template-generator/src/generators/alchemy/writer";

const baseConfig = {
  projectName: "addon-registry-test",
  projectDir: "/tmp/addon-registry-test",
  relativePath: "addon-registry-test",
  webDeploy: "cloudflare",
  serverDeploy: "cloudflare",
  backend: "hono",
  runtime: "workers",
  database: "postgres",
  orm: "prisma",
  auth: "better-auth",
  payments: "none",
  api: "orpc",
  frontend: ["next"],
  addons: [],
  examples: ["todo"],
  dbSetup: "neon",
  install: false,
  git: false,
  packageManager: "bun",
} satisfies ProjectConfig;

function planFor(addons: ProjectConfig["addons"]) {
  return createAlchemyDeploymentPlan({ ...baseConfig, addons });
}

describe("Alchemy addon registry", () => {
  it("activates only provider addons, in catalog order", () => {
    const plan = planFor(["fly-tigris", "turborepo", "aws-s3", "cloudflare-r2", "axiom"]);

    expect(activeAddons(plan)).toEqual(["cloudflare-r2", "aws-s3", "fly-tigris"]);
  });

  it("returns no active addons when only generic addons are selected", () => {
    expect(activeAddons(planFor([]))).toEqual([]);
    expect(activeAddons(planFor(["axiom", "turborepo", "biome"]))).toEqual([]);
  });

  it("writes resource declarations for selected provider addons", () => {
    const plan = planFor(["cloudflare-r2"]);
    const writer = createAlchemyWriter();

    writeAddonImports(writer, plan);
    writeAddonResources(writer, plan);

    expect(writer.toString()).toContain('Cloudflare.R2.Bucket("r2-bucket"');
    expect(hasAddonRenderers(plan)).toBe(true);
  });

  it("contributes bindings for the registered provider addons only", () => {
    const plan = planFor(["cloudflare-r2", "aws-s3", "fly-tigris", "prisma-buckets"]);

    expect(addonBindings(plan)).toEqual(["R2_BUCKET: r2Bucket,"]);
    expect(addonEnv(plan)).toEqual([]);
    expect(addonInfraDeps(plan)).toEqual([]);
  });

  it("registers a renderer for every Cloudflare provider addon", () => {
    for (const addon of [
      "cloudflare-durable-objects",
      "cloudflare-containers",
      "cloudflare-sandboxes",
      "cloudflare-r2",
      "cloudflare-kv",
      "cloudflare-queues",
      "cloudflare-workers-ai",
      "cloudflare-ai-search",
      "cloudflare-flagship",
      "cloudflare-pipelines",
      "cloudflare-stream",
      "cloudflare-realtime-kit",
    ] as const) {
      expect(ADDON_RENDERERS[addon]).toBeDefined();
    }
  });

  it("activates no renderers when the provider target is unavailable", () => {
    const plan = createAlchemyDeploymentPlan({
      ...baseConfig,
      webDeploy: "none",
      serverDeploy: "none",
      addons: ["cloudflare-r2"],
    });

    expect(hasAddonRenderers(plan)).toBe(false);
    expect(addonBindings(plan)).toEqual([]);
  });
});
