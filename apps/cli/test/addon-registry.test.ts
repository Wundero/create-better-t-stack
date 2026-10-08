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

  it("writes nothing for selected provider addons while the registry is empty", () => {
    const plan = planFor(["cloudflare-r2"]);
    const writer = createAlchemyWriter();

    writeAddonImports(writer, plan);
    writeAddonResources(writer, plan);

    expect(writer.toString()).toBe("");
    expect(hasAddonRenderers(plan)).toBe(false);
  });

  it("contributes no bindings, env, or infra deps without registered renderers", () => {
    const plan = planFor(["cloudflare-r2", "aws-s3", "fly-tigris", "prisma-buckets"]);

    expect(addonBindings(plan)).toEqual([]);
    expect(addonEnv(plan)).toEqual([]);
    expect(addonInfraDeps(plan)).toEqual([]);
  });

  it("starts with no registered renderers", () => {
    expect(ADDON_RENDERERS).toEqual({});
  });
});
