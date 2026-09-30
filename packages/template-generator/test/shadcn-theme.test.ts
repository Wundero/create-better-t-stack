import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { DEFAULT_PRESETS, encodePreset, type ProjectConfig } from "@better-t-stack/types";
import { Result } from "better-result";

import { processTemplateString } from "../src/core/template-processor";
import { generate } from "../src/generator";
import {
  ShadcnRegistryError,
  createHttpShadcnRegistryClient,
  type ResolvedShadcnTheme,
  type ShadcnRegistryClient,
} from "../src/shadcn";
import type { TemplateData } from "../src/template-handlers";
import { EMBEDDED_TEMPLATES } from "../src/templates.generated";
import type { GeneratorOptions, VirtualDirectory, VirtualFileTree } from "../src/types";

const fixturesDir = fileURLToPath(new URL("./fixtures/shadcn/", import.meta.url));

const PROJECT_NAME = "acme";

const BASE_CONFIG: ProjectConfig = {
  projectName: PROJECT_NAME,
  projectDir: "/tmp/acme",
  relativePath: PROJECT_NAME,
  database: "none",
  orm: "none",
  backend: "none",
  runtime: "none",
  frontend: ["next"],
  addons: [],
  examples: [],
  auth: "none",
  payments: "none",
  git: false,
  packageManager: "bun",
  install: false,
  dbSetup: "none",
  api: "none",
  webDeploy: "none",
  serverDeploy: "none",
};

interface BaseCase {
  readonly input: "baseui" | "radixui" | "react-aria";
  readonly registry: "base" | "radix" | "aria";
  readonly styleSlug: string;
  readonly primitivePackage: string;
}

const BASE_CASES: readonly BaseCase[] = [
  { input: "baseui", registry: "base", styleSlug: "base-maia", primitivePackage: "@base-ui/react" },
  { input: "radixui", registry: "radix", styleSlug: "radix-maia", primitivePackage: "radix-ui" },
  {
    input: "react-aria",
    registry: "aria",
    styleSlug: "aria-maia",
    primitivePackage: "react-aria-components",
  },
];

async function serveFixture(relativePath: string): Promise<Response | null> {
  try {
    const body = await readFile(`${fixturesDir}${relativePath}`, "utf8");
    return new Response(body, { headers: { "content-type": "application/json" } });
  } catch {
    return null;
  }
}

let server: ReturnType<typeof Bun.serve>;
let origin = "";
let templates: TemplateData;

beforeAll(async () => {
  templates = EMBEDDED_TEMPLATES;
  server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/init") {
        const base = url.searchParams.get("base") ?? "base";
        const style = url.searchParams.get("style") ?? "maia";
        const rtl = url.searchParams.get("rtl") === "true";
        const fixture = await serveFixture(`init/${base}-${style}${rtl ? "-rtl" : ""}.json`);
        return fixture ?? new Response("bad request", { status: 400 });
      }
      const match = /^\/r\/styles\/([^/]+)\/([^/]+)\.json$/.exec(url.pathname);
      if (match) {
        const style = match[1] ?? "";
        const name = match[2] ?? "";
        const fixture = await serveFixture(`styles/${style}/${name}.json`);
        return fixture ?? new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  origin = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

function registryClient(): ShadcnRegistryClient {
  return createHttpShadcnRegistryClient({ baseUrl: origin });
}

function makeConfig(shadcn?: ProjectConfig["shadcn"]): ProjectConfig {
  if (shadcn === undefined) return { ...BASE_CONFIG };
  return { ...BASE_CONFIG, shadcn };
}

function unexpectedRegistryError(): ShadcnRegistryError {
  return new ShadcnRegistryError({
    message: "registry must not be contacted",
    url: "",
    status: null,
  });
}

interface SpyRegistry {
  readonly client: ShadcnRegistryClient;
  readonly calls: string[];
}

function createSpyRegistry(): SpyRegistry {
  const calls: string[] = [];
  return {
    calls,
    client: {
      resolveBase: () => {
        calls.push("resolveBase");
        return Promise.resolve(Result.err(unexpectedRegistryError()));
      },
      getItem: (_style, name) => {
        calls.push(`getItem:${name}`);
        return Promise.resolve(Result.err(unexpectedRegistryError()));
      },
    },
  };
}

async function generateTree(options: GeneratorOptions): Promise<VirtualFileTree> {
  const result = await generate(options);
  if (!result.isOk()) {
    throw new Error(`generate failed: ${result.error.message}`);
  }
  return result.value;
}

function collectFiles(tree: VirtualFileTree): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: VirtualDirectory): void => {
    for (const child of dir.children) {
      if (child.type === "file") files.set(child.path, child.content);
      else walk(child);
    }
  };
  walk(tree.root);
  return files;
}

function readTreeFile(tree: VirtualFileTree, path: string): string {
  const content = collectFiles(tree).get(path);
  if (content === undefined) throw new Error(`missing generated file ${path}`);
  return content;
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

interface UiPackageJson {
  dependencies?: Record<string, string>;
}

interface ComponentsJson {
  style?: string;
  rsc?: boolean;
  iconLibrary?: string;
  menuColor?: string;
  menuAccent?: string;
  rtl?: boolean;
  aliases?: Record<string, string>;
  tailwind?: { css?: string; baseColor?: string };
}

describe("shadcn theme generation across bases", () => {
  for (const baseCase of BASE_CASES) {
    test(`${baseCase.registry}: applies style, icons, css and dependencies`, async () => {
      const tree = await generateTree({
        config: makeConfig({ preset: "maia", base: baseCase.input }),
        templates,
        registry: registryClient(),
      });
      const files = collectFiles(tree);

      const componentsJson = parseJson<ComponentsJson>(
        readTreeFile(tree, "packages/ui/components.json"),
      );
      expect(componentsJson.style).toBe(baseCase.styleSlug);
      expect(componentsJson.iconLibrary).toBe("hugeicons");
      expect(componentsJson.menuColor).toBe("default-translucent");
      expect(componentsJson.menuAccent).toBe("subtle");
      expect(componentsJson.rsc).toBe(true);
      expect(componentsJson.aliases?.components).toBe(`@${PROJECT_NAME}/ui/components`);
      expect(componentsJson.aliases?.utils).toBe(`@${PROJECT_NAME}/ui/lib/utils`);

      const globals = readTreeFile(tree, "packages/ui/src/styles/globals.css");
      expect(globals).toContain("--color-background: var(--background);");
      expect(globals).toContain(":root {");
      expect(globals).toContain(".dark {");

      const button = readTreeFile(tree, "packages/ui/src/components/button.tsx");
      expect(button).not.toContain("IconPlaceholder");
      expect(button).not.toContain("@/registry/");

      const inputGroup = readTreeFile(tree, "packages/ui/src/components/input-group.tsx");
      expect(inputGroup).not.toContain("@/registry/");
      expect(inputGroup).toContain(`@${PROJECT_NAME}/ui/components/button`);

      const checkbox = readTreeFile(tree, "packages/ui/src/components/checkbox.tsx");
      expect(checkbox).not.toContain("IconPlaceholder");
      expect(checkbox).toContain("@hugeicons/core-free-icons");

      const uiPackage = parseJson<UiPackageJson>(readTreeFile(tree, "packages/ui/package.json"));
      const deps = uiPackage.dependencies ?? {};
      expect(deps[baseCase.primitivePackage]).toBeDefined();
      if (baseCase.registry === "base") {
        expect(deps["@base-ui/react"]).toBeDefined();
      } else {
        expect(deps["@base-ui/react"]).toBeUndefined();
      }
      expect(deps["@hugeicons/react"]).toBeDefined();
      expect(deps["@hugeicons/core-free-icons"]).toBeDefined();
      expect(deps["@fontsource-variable/outfit"]).toBeDefined();
      expect(deps["@fontsource-variable/raleway"]).toBeDefined();
      expect(deps["@shadcn/react"]).toBeDefined();
      expect(deps["shadcn"]).toBeDefined();

      const registryBase = parseJson<{ dependencies: string[] }>(
        await readFile(`${fixturesDir}init/${baseCase.styleSlug}.json`, "utf8"),
      );
      expect(registryBase.dependencies).toContain("shadcn@latest");
      expect(deps["shadcn@latest"]).toBeUndefined();

      expect(files.has("packages/ui/src/components/direction.tsx")).toBe(false);
    });
  }
});

describe("shadcn pointer override", () => {
  test("emits the pointer rule only when requested", async () => {
    const withPointer = await generateTree({
      config: makeConfig({ preset: "maia", pointer: true }),
      templates,
      registry: registryClient(),
    });
    const withoutPointer = await generateTree({
      config: makeConfig({ preset: "maia" }),
      templates,
      registry: registryClient(),
    });

    expect(readTreeFile(withPointer, "packages/ui/src/styles/globals.css")).toContain(
      'button:not(:disabled), [role="button"]:not(:disabled) {',
    );
    expect(readTreeFile(withoutPointer, "packages/ui/src/styles/globals.css")).not.toContain(
      "button:not(:disabled)",
    );
  });
});

describe("shadcn rtl override", () => {
  test("writes direction.tsx and flips rtl in components.json", async () => {
    const tree = await generateTree({
      config: makeConfig({ preset: "maia", base: "baseui", rtl: true }),
      templates,
      registry: registryClient(),
    });

    const direction = readTreeFile(tree, "packages/ui/src/components/direction.tsx");
    expect(direction).toContain("DirectionProvider");

    const componentsJson = parseJson<ComponentsJson>(
      readTreeFile(tree, "packages/ui/components.json"),
    );
    expect(componentsJson.rtl).toBe(true);

    const webComponentsJson = parseJson<ComponentsJson>(
      readTreeFile(tree, "apps/web/components.json"),
    );
    expect(webComponentsJson.rtl).toBe(true);
  });
});

const RTL_ROOT_CASES = [
  { frontend: "next", layoutPath: "apps/web/src/app/layout.tsx" },
  { frontend: "tanstack-start", layoutPath: "apps/web/src/routes/__root.tsx" },
  { frontend: "react-router", layoutPath: "apps/web/src/root.tsx" },
  { frontend: "tanstack-router", layoutPath: "apps/web/index.html" },
] as const;

describe("shadcn rtl document direction", () => {
  for (const { frontend, layoutPath } of RTL_ROOT_CASES) {
    test(`${frontend}: emits dir="rtl" on the document root only when rtl is enabled`, async () => {
      const withRtl = await generateTree({
        config: {
          ...BASE_CONFIG,
          frontend: [frontend],
          shadcn: { preset: "maia", rtl: true },
        },
        templates,
        registry: registryClient(),
      });
      expect(readTreeFile(withRtl, layoutPath)).toContain('dir="rtl"');

      const withoutRtl = await generateTree({
        config: { ...BASE_CONFIG, frontend: [frontend], shadcn: { preset: "maia" } },
        templates,
        registry: registryClient(),
      });
      expect(readTreeFile(withoutRtl, layoutPath)).not.toContain('dir="rtl"');
    });
  }
});

interface ParityCase {
  readonly frontend: "next" | "tanstack-start" | "react-router" | "tanstack-router";
  readonly files: readonly { readonly template: string; readonly generated: string }[];
}

const PARITY_CASES: readonly ParityCase[] = [
  {
    frontend: "next",
    files: [
      {
        template: "frontend/react/next/src/app/layout.tsx.hbs",
        generated: "apps/web/src/app/layout.tsx",
      },
    ],
  },
  {
    frontend: "tanstack-start",
    files: [
      {
        template: "frontend/react/tanstack-start/src/routes/__root.tsx.hbs",
        generated: "apps/web/src/routes/__root.tsx",
      },
    ],
  },
  {
    frontend: "react-router",
    files: [
      {
        template: "frontend/react/react-router/src/root.tsx.hbs",
        generated: "apps/web/src/root.tsx",
      },
    ],
  },
  {
    frontend: "tanstack-router",
    files: [
      {
        template: "frontend/react/tanstack-router/index.html.hbs",
        generated: "apps/web/index.html",
      },
      {
        template: "frontend/react/tanstack-router/src/routes/__root.tsx.hbs",
        generated: "apps/web/src/routes/__root.tsx",
      },
    ],
  },
];

describe("no shadcn config parity", () => {
  for (const { frontend, files } of PARITY_CASES) {
    test(`${frontend}: root file is byte-identical and free of rtl artifacts`, async () => {
      const config: ProjectConfig = { ...BASE_CONFIG, frontend: [frontend] };
      const tree = await generateTree({ config, templates });

      for (const { template, generated } of files) {
        const entry = templates.get(template);
        expect(entry, template).toBeDefined();
        if (entry === undefined || entry.kind !== "template") continue;
        const content = readTreeFile(tree, generated);
        expect(content, generated).toBe(processTemplateString(entry, config));
        expect(content, generated).not.toContain('dir="rtl"');
        expect(content, generated).not.toContain("DirectionProvider");
      }
    });
  }
});

const RTL_PROVIDER_CASES = [
  { frontend: "next", layoutPath: "apps/web/src/app/layout.tsx" },
  { frontend: "tanstack-start", layoutPath: "apps/web/src/routes/__root.tsx" },
  { frontend: "react-router", layoutPath: "apps/web/src/root.tsx" },
  { frontend: "tanstack-router", layoutPath: "apps/web/src/routes/__root.tsx" },
] as const;

describe("shadcn rtl direction provider", () => {
  for (const { frontend, layoutPath } of RTL_PROVIDER_CASES) {
    test(`${frontend}: mounts DirectionProvider from the ui package only when rtl is enabled`, async () => {
      const withRtl = await generateTree({
        config: {
          ...BASE_CONFIG,
          frontend: [frontend],
          shadcn: { preset: "maia", rtl: true },
        },
        templates,
        registry: registryClient(),
      });
      const layout = readTreeFile(withRtl, layoutPath);
      expect(layout).toContain(
        `import { DirectionProvider } from "@${PROJECT_NAME}/ui/components/direction";`,
      );
      expect(layout).toContain('<DirectionProvider direction="rtl">');
      expect(readTreeFile(withRtl, "packages/ui/src/components/direction.tsx")).toContain(
        "DirectionProvider",
      );

      const withoutRtl = await generateTree({
        config: { ...BASE_CONFIG, frontend: [frontend], shadcn: { preset: "maia" } },
        templates,
        registry: registryClient(),
      });
      expect(readTreeFile(withoutRtl, layoutPath)).not.toContain("DirectionProvider");
    });
  }
});

describe("shadcn preset input forms", () => {
  test("accepts a preset code", async () => {
    const code = encodePreset(DEFAULT_PRESETS.maia);
    const tree = await generateTree({
      config: makeConfig({ preset: code }),
      templates,
      registry: registryClient(),
    });
    const componentsJson = parseJson<ComponentsJson>(
      readTreeFile(tree, "packages/ui/components.json"),
    );
    expect(componentsJson.style).toBe("base-maia");
  });

  test("accepts a preset code combined with an explicit base", async () => {
    const code = encodePreset(DEFAULT_PRESETS.maia);
    const tree = await generateTree({
      config: makeConfig({ preset: code, base: "react-aria" }),
      templates,
      registry: registryClient(),
    });
    const componentsJson = parseJson<ComponentsJson>(
      readTreeFile(tree, "packages/ui/components.json"),
    );
    expect(componentsJson.style).toBe("aria-maia");
  });

  test("accepts a registry URL", async () => {
    const url =
      "https://ui.shadcn.com/init?style=maia&baseColor=taupe&theme=taupe&iconLibrary=hugeicons&font=outfit&radius=medium";
    const tree = await generateTree({
      config: makeConfig({ preset: url }),
      templates,
      registry: registryClient(),
    });
    const componentsJson = parseJson<ComponentsJson>(
      readTreeFile(tree, "packages/ui/components.json"),
    );
    expect(componentsJson.style).toBe("base-maia");
    expect(componentsJson.iconLibrary).toBe("hugeicons");
  });
});

describe("no shadcn config", () => {
  test("is byte-identical to the static template output and never contacts the registry", async () => {
    const baseline = await generateTree({ config: makeConfig(), templates });
    const spy = createSpyRegistry();
    const withoutShadcn = await generateTree({
      config: makeConfig(),
      templates,
      registry: spy.client,
    });

    const baselineFiles = collectFiles(baseline);
    const actualFiles = collectFiles(withoutShadcn);
    const baselineUi = [...baselineFiles].filter(([path]) => path.startsWith("packages/ui/"));
    const actualUi = [...actualFiles].filter(([path]) => path.startsWith("packages/ui/"));

    expect(actualUi).toEqual(baselineUi);
    expect(actualFiles.has("packages/ui/src/components/direction.tsx")).toBe(false);
    expect(spy.calls).toEqual([]);
  });
});

describe("invalid shadcn config", () => {
  test("returns a shadcn-resolution error for an invalid preset", async () => {
    const result = await generate({
      config: makeConfig({ preset: "not a valid preset" }),
      templates,
      registry: registryClient(),
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.phase).toBe("shadcn-resolution");
  });

  test("returns a shadcn-resolution error when the preset is missing", async () => {
    const result = await generate({
      config: makeConfig({ base: "baseui" }),
      templates,
      registry: registryClient(),
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.phase).toBe("shadcn-resolution");
  });

  test("returns a shadcn-resolution error when the registry client fails", async () => {
    const spy = createSpyRegistry();
    const result = await generate({
      config: makeConfig({ preset: "maia" }),
      templates,
      registry: spy.client,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.phase).toBe("shadcn-resolution");
    expect(spy.calls).toContain("resolveBase");
  });
});

describe("shadcn base default", () => {
  test("omitting base resolves the default baseui registry", async () => {
    const tree = await generateTree({
      config: makeConfig({ preset: "maia" }),
      templates,
      registry: registryClient(),
    });

    const uiPackage = parseJson<UiPackageJson>(readTreeFile(tree, "packages/ui/package.json"));
    expect(uiPackage.dependencies?.["@base-ui/react"]).toBeDefined();

    const componentsJson = parseJson<ComponentsJson>(
      readTreeFile(tree, "packages/ui/components.json"),
    );
    expect(componentsJson.style).toBe("base-maia");
  });
});

function injectedTheme(dependencies: readonly string[]): ResolvedShadcnTheme {
  return {
    base: {
      extends: "base",
      name: "base-maia",
      dependencies: [],
      registryDependencies: [],
      cssVars: {},
      type: "registry:base",
      config: {
        style: "base-maia",
        tailwind: { baseColor: "neutral" },
        iconLibrary: "lucide",
        rtl: false,
        menuColor: "default",
        menuAccent: "subtle",
      },
    },
    style: "base-maia",
    iconLibrary: "lucide",
    rtl: false,
    pointer: false,
    fonts: [],
    components: new Map(),
    utilsSource: 'export { cn } from "cn";',
    dependencies,
  };
}

describe("shadcn dependency pinning", () => {
  test("fails with shadcn-dependencies for an unpinned registry dependency", async () => {
    const result = await generate({
      config: makeConfig({ preset: "maia" }),
      templates,
      shadcn: injectedTheme(["totally-unknown-package"]),
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.phase).toBe("shadcn-dependencies");
    expect(result.error.message).toContain("totally-unknown-package");
  });
});
