import { describe, expect, it } from "bun:test";

import type { API, Addons, Frontend } from "../src";
import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

async function createVirtualFiles(config: Parameters<typeof createVirtual>[0]) {
  const result = await createVirtual(config);

  if (result.isErr()) {
    throw result.error;
  }

  return collectFiles(result.value.root, result.value.root.path);
}

const SHADCN_RULES = [
  "shadcn/no-arbitrary-values",
  "shadcn/no-inline-styles",
  "shadcn/no-raw-colors",
  "shadcn/no-restyle",
  "shadcn/no-unknown-classes",
  "shadcn/require-static-classes",
] as const;

const unsupportedFrontends = ["astro", "solid", "native-unistyles", "nuxt"] as const;

const unsupportedApis = {
  astro: "orpc",
  solid: "orpc",
  "native-unistyles": "trpc",
  nuxt: "orpc",
} as const satisfies Record<(typeof unsupportedFrontends)[number], API>;

function baseConfig(
  projectName: string,
  frontend: Frontend,
  addons: Addons[],
  api: API = "trpc",
): Parameters<typeof createVirtual>[0] {
  return {
    projectName,
    frontend: [frontend],
    backend: "hono",
    runtime: "bun",
    database: "sqlite",
    orm: "drizzle",
    auth: "none",
    addons,
    examples: ["none"],
    dbSetup: "none",
    webDeploy: "none",
    serverDeploy: "none",
    packageManager: "bun",
    payments: "none",
    api,
  };
}

describe("shadcn lint config", () => {
  it("wires @shadcn/lint into .oxlintrc.json for oxlint + tanstack-router", async () => {
    const files = await createVirtualFiles(
      baseConfig("shadcn-oxlint", "tanstack-router", ["oxlint"]),
    );

    const raw = files.get(".oxlintrc.json");
    expect(raw).toBeDefined();

    const config = JSON.parse(raw ?? "{}");

    // init baseline preserved
    expect(config.plugins).toEqual(["typescript", "unicorn", "oxc"]);
    expect(config.categories.correctness).toBe("error");
    expect(config.env.builtin).toBe(true);
    expect(config.$schema).toBe("./node_modules/oxlint/configuration_schema.json");

    // shadcn wiring
    expect(config.jsPlugins).toEqual(["@shadcn/lint"]);
    expect(config.settings.shadcn.ui).toBe("@shadcn-oxlint/ui/components");

    for (const rule of SHADCN_RULES) {
      expect(config.rules[rule]).toBeDefined();
    }
    expect(config.rules["shadcn/no-arbitrary-values"]).toEqual(["error", { allow: ["layout"] }]);
    expect(config.rules["shadcn/no-inline-styles"]).toBe("error");
    expect(config.rules["shadcn/no-restyle"]).toEqual(["error", { allow: ["layout"] }]);

    expect(Array.isArray(config.overrides)).toBe(true);
    const [override] = config.overrides;
    expect(override.files).toEqual(["packages/ui/**"]);
    expect(override.rules["shadcn/no-restyle"]).toBe("off");
    expect(override.rules["shadcn/no-unknown-classes"]).toBe("off");
  });

  it("wires the shadcn lint block into vite.config.ts for vite-plus + tanstack-router", async () => {
    const files = await createVirtualFiles(
      baseConfig("shadcn-vite-plus", "tanstack-router", ["vite-plus"]),
    );

    const viteConfig = files.get("vite.config.ts");
    expect(viteConfig).toBeDefined();

    expect(viteConfig).toContain('"@shadcn/lint"');
    expect(viteConfig).toContain("shadcn/no-restyle");
    expect(viteConfig).toContain("settings");
    expect(viteConfig).toContain("ui:");

    // vite-plus is not the oxlint addon, so no standalone oxlint config
    expect(files.get(".oxlintrc.json")).toBeUndefined();
  });

  it("does not add shadcn config for oxlint on unsupported frontends", async () => {
    for (const frontend of unsupportedFrontends) {
      const files = await createVirtualFiles(
        baseConfig(
          `shadcn-unsupported-${frontend}`,
          frontend,
          ["oxlint"],
          unsupportedApis[frontend],
        ),
      );

      const raw = files.get(".oxlintrc.json");
      expect(raw).toBeDefined();

      const config = JSON.parse(raw ?? "{}");
      expect(config.plugins).toEqual(["typescript", "unicorn", "oxc"]);
      expect(config.categories.correctness).toBe("error");
      expect(config.env.builtin).toBe(true);
      expect(config.jsPlugins).toBeUndefined();
      expect(config.settings).toBeUndefined();
      expect(config.rules).toEqual({});
      expect(config.overrides).toBeUndefined();
      expect(JSON.stringify(config)).not.toContain("shadcn");
    }
  });

  it("does not add shadcn config for vite-plus on unsupported frontends", async () => {
    for (const frontend of unsupportedFrontends) {
      const files = await createVirtualFiles(
        baseConfig(
          `vite-plus-unsupported-${frontend}`,
          frontend,
          ["vite-plus"],
          unsupportedApis[frontend],
        ),
      );

      const viteConfig = files.get("vite.config.ts") ?? "";
      expect(viteConfig).toContain("typeCheck: false");
      expect(viteConfig).not.toContain("shadcn");
    }
  });

  it("leaves Biome config untouched and does not emit .oxlintrc.json", async () => {
    const files = await createVirtualFiles(
      baseConfig("shadcn-biome", "tanstack-router", ["biome"]),
    );

    const biomeConfig = files.get("biome.json");
    expect(biomeConfig).toBeDefined();
    expect(biomeConfig).not.toContain("shadcn");

    expect(files.get(".oxlintrc.json")).toBeUndefined();
  });

  it("adds @shadcn/lint to root devDependencies only for supported frontends", async () => {
    const supportedOxlint = await createVirtualFiles(
      baseConfig("deps-oxlint-supported", "tanstack-router", ["oxlint"]),
    );
    const supportedVitePlus = await createVirtualFiles(
      baseConfig("deps-vite-plus-supported", "react-router", ["vite-plus"]),
    );
    const unsupportedOxlint = await createVirtualFiles(
      baseConfig("deps-oxlint-unsupported", "astro", ["oxlint"], unsupportedApis.astro),
    );
    const unsupportedVitePlus = await createVirtualFiles(
      baseConfig("deps-vite-plus-unsupported", "nuxt", ["vite-plus"], unsupportedApis.nuxt),
    );

    const readDevDeps = (files: Map<string, string>) =>
      (
        JSON.parse(files.get("package.json") ?? "{}") as {
          devDependencies?: Record<string, string>;
        }
      ).devDependencies ?? {};

    expect(readDevDeps(supportedOxlint)["@shadcn/lint"]).toBeDefined();
    expect(readDevDeps(supportedVitePlus)["@shadcn/lint"]).toBeDefined();
    expect(readDevDeps(unsupportedOxlint)["@shadcn/lint"]).toBeUndefined();
    expect(readDevDeps(unsupportedVitePlus)["@shadcn/lint"]).toBeUndefined();
  });
});
