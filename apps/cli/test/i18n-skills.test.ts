import { describe, expect, test } from "bun:test";

import { getRecommendedSourceKeys } from "../src/helpers/addons/skills-setup";
import type { ProjectConfig } from "../src/types";

function createProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "test-app",
    projectDir: "/tmp/test-app",
    relativePath: ".",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["tanstack-router"],
    addons: ["skills"],
    examples: [],
    auth: "none",
    payments: "none",
    emailRenderer: "none",
    emailDeploy: "none",
    git: false,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
    i18n: "none",
    ...overrides,
  };
}

describe("skills i18n source", () => {
  test("recommends lingui/skills for a lingui project", () => {
    expect(getRecommendedSourceKeys(createProjectConfig({ i18n: "lingui" }))).toContain(
      "lingui/skills",
    );
  });

  test("does not recommend lingui/skills without lingui", () => {
    expect(getRecommendedSourceKeys(createProjectConfig())).not.toContain("lingui/skills");
    expect(getRecommendedSourceKeys(createProjectConfig({ i18n: "paraglide" }))).not.toContain(
      "lingui/skills",
    );
  });
});
