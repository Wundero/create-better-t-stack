import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expectSuccess, runTRPCTest } from "./test-utils";

describe("Shadcn Theme Integration", () => {
  it("should render default colors when no theme preset is provided", async () => {
    const result = await runTRPCTest({
      projectName: "theme-default",
      addons: ["none"],
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "better-auth",
      api: "trpc",
      examples: ["none"],
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
      email: "none",
      emailProvider: "none",
      i18n: "none",
      install: false,
    });

    expectSuccess(result);
    expect(result.projectDir).toBeDefined();

    const globalsCss = join(result.projectDir!, "packages", "ui", "src", "styles", "globals.css");
    expect(existsSync(globalsCss)).toBe(true);

    const cssContent = readFileSync(globalsCss, "utf-8");
    expect(cssContent).toContain("--background: oklch(1 0 0)");
    expect(cssContent).toContain("--radius: 0.625rem");
  });

  it("should render custom theme colors when a preset is provided", async () => {
    const preset = {
      v: 1,
      name: "Crimson Pine",
      light: { background: "#ff0000", primary: "#cc0000" },
      dark: { background: "#330000", primary: "#990000" },
      radius: 0.5,
    };
    const encoded = Buffer.from(JSON.stringify(preset)).toString("base64");

    const result = await runTRPCTest({
      projectName: "theme-custom",
      addons: ["none"],
      frontend: ["tanstack-router"],
      backend: "hono",
      runtime: "bun",
      database: "sqlite",
      orm: "drizzle",
      auth: "better-auth",
      api: "trpc",
      examples: ["none"],
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
      email: "none",
      emailProvider: "none",
      i18n: "none",
      shadcnTheme: encoded,
      install: false,
    });

    expectSuccess(result);
    expect(result.projectDir).toBeDefined();

    const globalsCss = join(result.projectDir!, "packages", "ui", "src", "styles", "globals.css");
    expect(existsSync(globalsCss)).toBe(true);

    const cssContent = readFileSync(globalsCss, "utf-8");
    expect(cssContent).toContain("--background: #ff0000");
    expect(cssContent).toContain("--primary: #cc0000");
    expect(cssContent).toContain("--radius: 0.5rem");
  });
});
