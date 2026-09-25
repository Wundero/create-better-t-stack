import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type VirtualConfig = Parameters<typeof createVirtual>[0];

async function generateFiles(config: VirtualConfig): Promise<Map<string, string>> {
  const result = await createVirtual({
    projectName: "theme-check",
    backend: "hono",
    runtime: "bun",
    api: "trpc",
    auth: "better-auth",
    database: "none",
    orm: "none",
    addons: ["none"],
    examples: ["none"],
    dbSetup: "none",
    webDeploy: "none",
    serverDeploy: "none",
    install: false,
    git: false,
    packageManager: "bun",
    payments: "none",
    ...config,
  });

  expect(result.isOk()).toBe(true);

  if (result.isErr()) {
    throw result.error;
  }

  return collectFiles(result.value.root, result.value.root.path);
}

function expectNoNextThemes(files: Map<string, string>) {
  for (const [path, content] of files) {
    expect(content).not.toContain("next-themes");
    expect(path).not.toContain("next-themes");
  }
}

// Generator dedupes shared deps into root workspaces.catalog ("catalog:" in leaf pkg).
function expectThemeVersionPinned(files: Map<string, string>) {
  const pinned = [...files.values()].some((content) =>
    content.includes('"@wrksz/themes": "^2.0.2"'),
  );
  expect(pinned).toBe(true);
}

describe("theme provider migration to @wrksz/themes", () => {
  describe("next", () => {
    it("uses the server-safe @wrksz/themes/next provider in the layout", async () => {
      const files = await generateFiles({
        frontend: ["next"],
        backend: "self",
        runtime: "none",
        api: "trpc",
        auth: "better-auth",
      });

      const pkg = files.get("apps/web/package.json");
      expect(pkg).toBeDefined();
      expect(pkg).toContain('"@wrksz/themes"');
      expect(pkg).not.toContain("next-themes");
      expectThemeVersionPinned(files);

      const layout = files.get("apps/web/src/app/layout.tsx");
      expect(layout).toBeDefined();
      expect(layout).toContain('from "@wrksz/themes/next"');
      expect(layout).toContain("<ThemeProvider");

      const providers = files.get("apps/web/src/components/providers.tsx");
      expect(providers).toBeDefined();
      expect(providers).not.toContain("./theme-provider");
      expect(providers).not.toContain("<ThemeProvider");

      const themeProviderKeys = [...files.keys()].filter((key) =>
        key.endsWith("components/theme-provider.tsx"),
      );
      expect(themeProviderKeys).toEqual([]);

      const modeToggle = files.get("apps/web/src/components/mode-toggle.tsx");
      expect(modeToggle).toBeDefined();
      expect(modeToggle).toContain("@wrksz/themes/client");

      expectNoNextThemes(files);
    });
  });

  describe("react-router", () => {
    it("wraps with ClientThemeProvider and hydrates the theme via ThemeScript", async () => {
      const files = await generateFiles({
        frontend: ["react-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        auth: "better-auth",
      });

      const themeProvider = files.get("apps/web/src/components/theme-provider.tsx");
      expect(themeProvider).toBeDefined();
      expect(themeProvider).toContain("ClientThemeProvider");
      expect(themeProvider).toContain("@wrksz/themes/client");
      expect(themeProvider).toContain('export { useTheme } from "@wrksz/themes/client"');

      const root = files.get("apps/web/src/root.tsx");
      expect(root).toBeDefined();
      expect(root).toContain("@wrksz/themes/script");
      expect(root).toContain("<ThemeScript");
      expect(root).toContain("suppressHydrationWarning");

      const pkg = files.get("apps/web/package.json");
      expect(pkg).toBeDefined();
      expect(pkg).toContain('"@wrksz/themes"');
      expectThemeVersionPinned(files);

      expectNoNextThemes(files);
    });
  });

  describe("tanstack-router", () => {
    it("uses ClientThemeProvider without a server theme script", async () => {
      const files = await generateFiles({
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        auth: "better-auth",
      });

      const themeProvider = files.get("apps/web/src/components/theme-provider.tsx");
      expect(themeProvider).toBeDefined();
      expect(themeProvider).toContain("@wrksz/themes/client");
      expect(themeProvider).not.toContain("ThemeScript");

      expectNoNextThemes(files);
    });
  });

  describe("tanstack-start", () => {
    it("ships no dead theme dependency", async () => {
      const files = await generateFiles({
        frontend: ["tanstack-start"],
        backend: "self",
        runtime: "none",
        api: "trpc",
        auth: "better-auth",
      });

      const pkg = files.get("apps/web/package.json");
      expect(pkg).toBeDefined();
      expect(pkg).not.toContain("next-themes");
      expect(pkg).not.toContain("@wrksz/themes");

      expectNoNextThemes(files);
    });
  });

  describe("shared ui package", () => {
    it("imports useTheme from @wrksz/themes/client in sonner", async () => {
      const files = await generateFiles({
        frontend: ["tanstack-router"],
        backend: "hono",
        runtime: "bun",
        api: "trpc",
        auth: "better-auth",
      });

      const pkg = files.get("packages/ui/package.json");
      expect(pkg).toBeDefined();
      expect(pkg).toContain("@wrksz/themes");
      expect(pkg).not.toContain("next-themes");

      const sonner = files.get("packages/ui/src/components/sonner.tsx");
      expect(sonner).toBeDefined();
      expect(sonner).toContain("@wrksz/themes/client");

      expectNoNextThemes(files);
    });
  });
});
