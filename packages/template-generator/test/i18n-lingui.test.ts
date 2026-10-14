import { describe, expect, test } from "bun:test";

import type { ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../src/core/virtual-fs";
import { getLinguiDeps } from "../src/processors/i18n/lingui";

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["next"],
    addons: ["turborepo"],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "lingui",
    git: true,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

function vfsWith(files: Record<string, string>): VirtualFileSystem {
  const vfs = new VirtualFileSystem();
  for (const [path, content] of Object.entries(files)) {
    vfs.writeFile(path, content);
  }
  return vfs;
}

function packageJson(name: string): string {
  return JSON.stringify({ name, scripts: {} }, null, 2);
}

function readPackage(
  vfs: VirtualFileSystem,
  path: string,
): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(vfs.readFile(path) ?? "{}");
}

const NEXT_CONFIG = [
  'import type { NextConfig } from "next";',
  "",
  "const nextConfig: NextConfig = {",
  "\ttypedRoutes: true,",
  "};",
  "",
  "export default nextConfig;",
  "",
].join("\n");

const NEXT_PROVIDERS = [
  '"use client";',
  "",
  'import { ThemeProvider } from "./theme-provider";',
  "",
  "export default function Providers({ children }: { children: React.ReactNode }) {",
  "  return (",
  '    <ThemeProvider attribute="class">',
  "      <Toaster />",
  "    </ThemeProvider>",
  "  );",
  "}",
  "",
].join("\n");

const NEXT_PAGE = [
  '"use client"',
  "",
  "export default function Home() {",
  "  return (",
  '    <div className="container mx-auto max-w-3xl px-4 py-2">',
  '      <pre className="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>',
  '      <div className="grid gap-6">',
  "      </div>",
  "    </div>",
  "  );",
  "}",
  "",
].join("\n");

describe("getLinguiDeps on Next + server (self)", () => {
  const vfs = vfsWith({
    "package.json": packageJson("demo"),
    "packages/i18n/package.json": packageJson("@demo/i18n"),
    "apps/web/package.json": packageJson("web"),
    "apps/web/next.config.ts": NEXT_CONFIG,
    "apps/web/src/components/providers.tsx": NEXT_PROVIDERS,
    "apps/web/src/app/page.tsx": NEXT_PAGE,
  });
  getLinguiDeps(vfs, baseConfig());

  test("adds the Lingui packages to the shared package and the web app", () => {
    const i18n = readPackage(vfs, "packages/i18n/package.json");
    expect(i18n.dependencies?.["@lingui/core"]).toBeDefined();
    expect(i18n.devDependencies?.["@lingui/cli"]).toBeDefined();

    const web = readPackage(vfs, "apps/web/package.json");
    expect(web.dependencies?.["@lingui/core"]).toBeDefined();
    expect(web.dependencies?.["@lingui/react"]).toBeDefined();
    expect(web.dependencies?.["@demo/i18n"]).toBe("workspace:*");
    expect(web.devDependencies?.["@lingui/swc-plugin"]).toBeDefined();
  });

  test("registers the SWC plugin in next.config.ts", () => {
    const config = vfs.readFile("apps/web/next.config.ts") ?? "";
    expect(config).toContain('import { linguiMacroSwcPlugin } from "@lingui/swc-plugin/options";');
    expect(config).toContain(
      "swcPlugins: [linguiMacroSwcPlugin({}, { configPath: LINGUI_CONFIG_PATH })]",
    );
  });

  test("wraps the provider root and renders the demo on the home page", () => {
    const providers = vfs.readFile("apps/web/src/components/providers.tsx") ?? "";
    expect(providers).toContain('import { I18nProvider } from "@/components/i18n-provider";');
    expect(providers).toContain("<I18nProvider>");
    expect(providers).toContain("</I18nProvider>");

    const page = vfs.readFile("apps/web/src/app/page.tsx") ?? "";
    expect(page).toContain('import { I18nDemo } from "@/components/i18n-demo";');
    expect(page).toContain("<I18nDemo />");
  });

  test("ships a PO and a compiled placeholder per default locale", () => {
    for (const locale of ["en", "es", "fr"]) {
      expect(vfs.exists(`packages/i18n/locales/${locale}/messages.po`)).toBe(true);
      expect(vfs.exists(`packages/i18n/locales/${locale}/messages.ts`)).toBe(true);
    }
  });
});

describe("getLinguiDeps catalogs follow the configured locales", () => {
  test("only writes the configured locales", () => {
    const vfs = vfsWith({ "packages/i18n/package.json": packageJson("@demo/i18n") });
    getLinguiDeps(
      vfs,
      baseConfig({
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "de"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    expect(vfs.exists("packages/i18n/locales/en/messages.po")).toBe(true);
    expect(vfs.exists("packages/i18n/locales/de/messages.po")).toBe(true);
    expect(vfs.exists("packages/i18n/locales/fr/messages.po")).toBe(false);
  });
});

describe("getLinguiDeps on Vite React surfaces", () => {
  const VITE_CONFIG = [
    'import tailwindcss from "@tailwindcss/vite";',
    'import react from "@vitejs/plugin-react";',
    'import { defineConfig } from "vite";',
    "",
    "export default defineConfig({",
    "  plugins: [",
    "    tailwindcss(),",
    "    react(),",
    "  ],",
    "});",
    "",
  ].join("\n");

  test("adds the lingui macro transform to tanstack-router", () => {
    const vfs = vfsWith({
      "apps/web/package.json": packageJson("web"),
      "apps/web/vite.config.ts": VITE_CONFIG,
      "apps/web/src/routes/index.tsx": NEXT_PAGE.replace(
        "export default function Home()",
        "function HomeComponent()",
      ),
    });
    getLinguiDeps(vfs, baseConfig({ frontend: ["tanstack-router"] }));

    const config = vfs.readFile("apps/web/vite.config.ts") ?? "";
    expect(config).toContain('import { lingui } from "@lingui/vite-plugin";');
    expect(config).toContain(
      'lingui({ macroTransform: true, configPath: "../../packages/i18n/lingui.config.ts" })',
    );
    const web = readPackage(vfs, "apps/web/package.json");
    expect(web.devDependencies?.["@lingui/vite-plugin"]).toBeDefined();
  });

  test("uses the babel macro plugin for solid (native transform unsupported)", () => {
    const SOLID_CONFIG = [
      'import solid from "@solidjs/vite-plugin";',
      'import { defineConfig } from "vite";',
      "",
      "export default defineConfig({",
      "  plugins: [",
      "    solid({",
      "      ssr: true,",
      "    }),",
      "  ],",
      "});",
      "",
    ].join("\n");
    const SOLID_APP = [
      'import { Router } from "~/router";',
      "",
      "export default function App() {",
      "  return (",
      "    <Router>",
      "      {(props) => <div>{props.children}</div>}",
      "    </Router>",
      "  );",
      "}",
      "",
    ].join("\n");
    const SOLID_INDEX = [
      "export default function Home() {",
      "  return (",
      '    <pre class="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>',
      "  );",
      "}",
      "",
    ].join("\n");

    const vfs = vfsWith({
      "apps/web/package.json": packageJson("web"),
      "apps/web/vite.config.ts": SOLID_CONFIG,
      "apps/web/src/App.tsx": SOLID_APP,
      "apps/web/src/routes/index.tsx": SOLID_INDEX,
    });
    getLinguiDeps(vfs, baseConfig({ frontend: ["solid"] }));

    const config = vfs.readFile("apps/web/vite.config.ts") ?? "";
    expect(config).toContain('plugins: ["@lingui/babel-plugin-lingui-macro"]');
    expect(config).toContain('lingui({ configPath: "../../packages/i18n/lingui.config.ts" })');
    expect(config).not.toContain("macroTransform");

    const app = vfs.readFile("apps/web/src/App.tsx") ?? "";
    expect(app).toContain('import { I18nProvider } from "~/components/i18n-provider";');
    expect(app).toContain("<I18nProvider>");

    const index = vfs.readFile("apps/web/src/routes/index.tsx") ?? "";
    expect(index).toContain('import { I18nDemo } from "~/components/i18n-demo";');

    const web = readPackage(vfs, "apps/web/package.json");
    expect(web.dependencies?.["@lingui/solid"]).toBeDefined();
    expect(web.devDependencies?.["@lingui/babel-plugin-lingui-macro"]).toBeDefined();
  });
});

describe("getLinguiDeps on native", () => {
  const NATIVE_INDEX = [
    'import { Container } from "@/components/container";',
    'import { Text, View } from "react-native";',
    "",
    "export default function Home() {",
    "  return (",
    "\t\t<Container>",
    "\t\t\t<View />",
    "\t\t</Container>",
    "  );",
    "}",
    "",
  ].join("\n");

  test("wires the metro transformer, the babel macro plugin and the tab demo", () => {
    const vfs = vfsWith({
      "apps/native/package.json": packageJson("native"),
      "apps/native/metro.config.js": [
        'const { withVarlockMetroConfig } = require("@varlock/expo-integration/metro-config");',
        'const { getDefaultConfig } = require("expo/metro-config");',
        "const config = getDefaultConfig(__dirname);",
        "",
        "module.exports = withVarlockMetroConfig(config);",
        "",
      ].join("\n"),
      "apps/native/babel.config.js": [
        "module.exports = {",
        '  presets: ["babel-preset-expo"],',
        '  plugins: [require("@varlock/expo-integration/babel-plugin")],',
        "};",
        "",
      ].join("\n"),
      "apps/native/app/(drawer)/(tabs)/index.tsx": NATIVE_INDEX,
    });
    getLinguiDeps(vfs, baseConfig({ frontend: ["native-uniwind"] }));

    const metro = vfs.readFile("apps/native/metro.config.js") ?? "";
    expect(metro).toContain("@lingui/metro-transformer/expo");
    expect(metro).toContain('"po", "pot"');

    const babel = vfs.readFile("apps/native/babel.config.js") ?? "";
    expect(babel).toContain('"@lingui/babel-plugin-lingui-macro"');

    const index = vfs.readFile("apps/native/app/(drawer)/(tabs)/index.tsx") ?? "";
    expect(index).toContain("<I18nDemo />");
    expect(index).toContain('import { I18nDemo } from "@/components/i18n-demo";');

    const native = readPackage(vfs, "apps/native/package.json");
    expect(native.devDependencies?.["@lingui/metro-transformer"]).toBeDefined();
    expect(native.dependencies?.["@lingui/react"]).toBeDefined();
  });
});

describe("getLinguiDeps on server surfaces", () => {
  const HONO_INDEX = [
    'import { ENV } from "./env.server";',
    'import { Hono } from "hono";',
    'import { cors } from "hono/cors";',
    "",
    "const app = new Hono();",
    "",
    'app.get("/", (c) => {',
    '\treturn c.text("OK");',
    "});",
    "",
    "export default app;",
    "",
  ].join("\n");

  test("adds the demo route and the Bun preload for hono on bun", () => {
    const vfs = vfsWith({
      "apps/server/package.json": packageJson("server"),
      "apps/server/src/index.ts": HONO_INDEX,
    });
    getLinguiDeps(
      vfs,
      baseConfig({ frontend: ["tanstack-router"], backend: "hono", runtime: "bun" }),
    );

    const index = vfs.readFile("apps/server/src/index.ts") ?? "";
    expect(index).toContain('app.get("/i18n-demo"');
    expect(index).toContain('import { getCookie } from "hono/cookie";');
    expect(index).toContain('import { renderI18nDemo } from "./i18n-demo";');

    const bunfig = vfs.readFile("apps/server/bunfig.toml") ?? "";
    expect(bunfig).toContain("preload");
    expect(bunfig).toContain("packages/i18n/bun-preload.ts");
  });

  test("writes the Nitro route file", () => {
    const vfs = vfsWith({
      "apps/server/package.json": packageJson("server"),
      "apps/server/src/index.ts": "export default {};\n",
    });
    getLinguiDeps(
      vfs,
      baseConfig({ frontend: ["tanstack-start"], backend: "nitro", runtime: "node" }),
    );

    const route = vfs.readFile("apps/server/server/routes/i18n-demo.get.ts") ?? "";
    expect(route).toContain("renderI18nDemo");
    expect(route).toContain("x-app-locale");
  });
});

describe("getLinguiDeps on Nuxt and Astro", () => {
  test("registers the Vite plugin in nuxt.config and adds the demo to the index page", () => {
    const vfs = vfsWith({
      "packages/i18n/package.json": packageJson("@demo/i18n"),
      "apps/web/package.json": packageJson("web"),
      "apps/web/nuxt.config.ts": [
        "// https://nuxt.com/docs/api/configuration/nuxt-config",
        "export default defineNuxtConfig({",
        "  compatibilityDate: 'latest',",
        "});",
        "",
      ].join("\n"),
      "apps/web/app/pages/index.vue": [
        "<template>",
        '  <UContainer class="py-8">',
        '    <pre class="overflow-x-auto font-mono text-sm whitespace-pre-wrap">{{ TITLE_TEXT }}</pre>',
        '    <div class="grid gap-6 mt-6">',
        "    </div>",
        "  </UContainer>",
        "</template>",
        "",
      ].join("\n"),
    });
    getLinguiDeps(vfs, baseConfig({ frontend: ["nuxt"], backend: "self", api: "none" }));

    const nuxt = vfs.readFile("apps/web/nuxt.config.ts") ?? "";
    expect(nuxt).toContain('import { lingui } from "@lingui/vite-plugin";');
    expect(nuxt).toContain("vite: {");
    expect(nuxt).toContain(
      'lingui({ macroTransform: true, configPath: "../../packages/i18n/lingui.config.ts" })',
    );

    const page = vfs.readFile("apps/web/app/pages/index.vue") ?? "";
    expect(page).toContain('<I18nDemo class="mt-6" />');

    const i18n = readPackage(vfs, "packages/i18n/package.json");
    expect(i18n.devDependencies?.["@lingui/extractor-vue"]).toBe("6.9.1");
  });

  test("registers the Vite plugin in astro.config and imports the demo component", () => {
    const vfs = vfsWith({
      "apps/web/package.json": packageJson("web"),
      "apps/web/astro.config.mjs": [
        'import tailwindcss from "@tailwindcss/vite";',
        'import { defineConfig } from "astro/config";',
        "",
        "export default defineConfig({",
        "  vite: {",
        "    plugins: [tailwindcss()],",
        "  },",
        "});",
        "",
      ].join("\n"),
      "apps/web/src/pages/index.astro": [
        "---",
        'import Layout from "../layouts/Layout.astro";',
        "---",
        "",
        "<Layout>",
        '  <pre class="overflow-x-auto font-mono text-sm text-white">{TITLE_TEXT}</pre>',
        "</Layout>",
        "",
      ].join("\n"),
    });
    getLinguiDeps(vfs, baseConfig({ frontend: ["astro"], backend: "self", api: "none" }));

    const config = vfs.readFile("apps/web/astro.config.mjs") ?? "";
    expect(config).toContain(
      'lingui({ macroTransform: true, configPath: "../../packages/i18n/lingui.config.ts" })',
    );

    const page = vfs.readFile("apps/web/src/pages/index.astro") ?? "";
    expect(page).toContain('import I18nDemo from "../components/I18nDemo.astro";');
    expect(page).toContain("<I18nDemo />");
  });
});

describe("getLinguiDeps on electrobun", () => {
  test("starts the Bun-process demo and registers the preload", () => {
    const vfs = vfsWith({
      "apps/desktop/package.json": packageJson("desktop"),
      "apps/desktop/src/bun/index.ts": [
        'import { BrowserWindow } from "electrobun/main";',
        "",
        'console.log("Electrobun desktop shell started.");',
        "",
      ].join("\n"),
    });
    getLinguiDeps(
      vfs,
      baseConfig({ frontend: ["tanstack-router"], addons: ["turborepo", "electrobun"] }),
    );

    const index = vfs.readFile("apps/desktop/src/bun/index.ts") ?? "";
    expect(index).toContain('import { printI18nDemo } from "./i18n-demo";');
    expect(index).toContain("await printI18nDemo();");
    expect(vfs.readFile("apps/desktop/bunfig.toml")).toContain("bun-preload.ts");
  });
});

describe("getLinguiDeps and externally scaffolded apps", () => {
  const SURFACE_FILE = "apps/extension/lib/i18n-demo.ts";

  test("drops WXT files while the scaffolded app does not exist", () => {
    const vfs = vfsWith({
      "apps/extension/lib/i18n-demo.ts": "// surface glue",
      "apps/web/package.json": packageJson("web"),
    });
    getLinguiDeps(vfs, baseConfig({ frontend: ["next"], addons: ["turborepo", "wxt"] }));

    expect(vfs.exists(SURFACE_FILE)).toBe(false);
  });

  test("keeps WXT files and adds deps when the app exists (Add Path)", () => {
    const vfs = vfsWith({
      "apps/extension/package.json": packageJson("extension"),
      "apps/extension/lib/i18n-demo.ts": "// surface glue",
    });
    getLinguiDeps(vfs, baseConfig({ frontend: ["none"], addons: ["turborepo", "wxt"] }));

    expect(vfs.exists(SURFACE_FILE)).toBe(true);
    const extension = readPackage(vfs, "apps/extension/package.json");
    expect(extension.dependencies?.["@lingui/core"]).toBeDefined();
  });
});

describe("getLinguiDeps safety", () => {
  test("skips anchored edits when the anchor is missing", () => {
    const vfs = vfsWith({
      "apps/web/package.json": packageJson("web"),
      "apps/web/src/components/providers.tsx":
        "export default function Providers() { return null; }\n",
    });
    getLinguiDeps(vfs, baseConfig());

    expect(vfs.readFile("apps/web/src/components/providers.tsx")).toBe(
      "export default function Providers() { return null; }\n",
    );
  });

  test("does nothing without the shared package", () => {
    const vfs = vfsWith({ "package.json": packageJson("demo") });
    getLinguiDeps(vfs, baseConfig());
    expect(vfs.exists("packages/i18n/locales/en/messages.po")).toBe(false);
  });
});
