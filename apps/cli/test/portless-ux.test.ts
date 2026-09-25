import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { displayPostInstallInstructions } from "../src/helpers/core/post-installation";
import { gatherConfig } from "../src/prompts/config-prompts";
import { getPortlessChoice } from "../src/prompts/portless";
import type { ProjectConfig } from "../src/types";
import { runWithContextAsync } from "../src/utils/context";
import { getConfigSections } from "../src/utils/display-config";

const baseConfig = {
  projectName: "acme-app",
  projectDir: "/tmp/acme-app",
  relativePath: "acme-app",
  database: "sqlite",
  backend: "hono",
  runtime: "bun",
  frontend: ["next"],
  addons: [],
  examples: [],
  auth: "none",
  payments: "none",
  git: false,
  packageManager: "bun",
  install: false,
  dbSetup: "none",
  orm: "drizzle",
  api: "trpc",
  webDeploy: "none",
  serverDeploy: "none",
} satisfies ProjectConfig;

afterEach(() => {
  mock.restore();
});

async function capturePostInstall(config: ProjectConfig & { depsInstalled: boolean }) {
  const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
  spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline in test"));

  await displayPostInstallInstructions(config);

  return stdout.mock.calls.map(([chunk]) => String(chunk)).join("");
}

describe("getPortlessChoice", () => {
  it("returns an explicit boolean without prompting", async () => {
    expect(await getPortlessChoice(true)).toBe(true);
    expect(await getPortlessChoice(false)).toBe(false);
  });
});

describe("portless display config", () => {
  it("shows the Portless row only when portless is enabled", () => {
    const enabled = getConfigSections({ ...baseConfig, portless: true });
    const delivery = enabled.find((section) => section.title === "Delivery");

    expect(delivery?.rows).toContainEqual({ label: "Portless", value: "Yes" });

    const disabled = getConfigSections({ ...baseConfig, portless: false });
    const unset = getConfigSections(baseConfig);
    const disabledLabels = [...disabled, ...unset].flatMap((section) =>
      section.rows.map((row) => row.label),
    );

    expect(disabledLabels).not.toContain("Portless");
  });
});

describe("portless silent config gathering", () => {
  it("threads the flag and defaults to disabled", async () => {
    const enabled = await runWithContextAsync({ silent: true }, () =>
      gatherConfig({ portless: true }, "acme-app", "/tmp/acme-app", "acme-app"),
    );
    const disabled = await runWithContextAsync({ silent: true }, () =>
      gatherConfig({}, "acme-app", "/tmp/acme-app", "acme-app"),
    );

    expect(enabled.portless).toBe(true);
    expect(disabled.portless).toBe(false);
  });
});

describe("portless post-install onboarding", () => {
  it("prints setup steps and dev URLs when enabled", async () => {
    const output = await capturePostInstall({ ...baseConfig, portless: true, depsInstalled: true });

    expect(output).toContain("npm i -g portless");
    expect(output).toContain("portless trust");
    expect(output).toContain("Node.js 24");
    expect(output).toContain("https://acme-app.localhost");
    expect(output).toContain("https://api.acme-app.localhost");
  });

  it("derives dev URLs from a sanitized project name", async () => {
    const output = await capturePostInstall({
      ...baseConfig,
      projectName: "My App!",
      portless: true,
      depsInstalled: true,
    });

    expect(output).toContain("https://my-app.localhost");
    expect(output).toContain("https://api.my-app.localhost");
  });

  it("stays silent when portless is disabled", async () => {
    const output = await capturePostInstall({ ...baseConfig, depsInstalled: true });

    expect(output).not.toContain("portless");
  });
});
