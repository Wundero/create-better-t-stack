import { describe, expect, test } from "bun:test";

import { I18nOptionsSchema, type ProjectConfig } from "@better-t-stack/types";

import { loadTemplates } from "../src/core/template-reader";
import { VirtualFileSystem } from "../src/core/virtual-fs";
import { processI18nDeps } from "../src/processors/i18n-deps";
import { processFrontendTemplates } from "../src/template-handlers/frontend";
import { processI18nTemplates } from "../src/template-handlers/i18n";

/**
 * Focused coverage for the `shadcn-direction` integration (task 7.9): the
 * static `dir="rtl"` / `DirectionProvider direction="rtl"` become a direction
 * derived from the active locale only when a shadcn theme exists, and RTL
 * support is auto-enabled for RTL locales.
 */

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
    api: "none",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

async function generateWeb(config: ProjectConfig): Promise<VirtualFileSystem> {
  const templates = await loadTemplates();
  const vfs = new VirtualFileSystem();
  await processFrontendTemplates(vfs, templates, config);
  await processI18nTemplates(vfs, templates, config);
  processI18nDeps(vfs, config);
  return vfs;
}

const SHADCN = { preset: "nova" } as const;

function optionsWith(locales: string[]) {
  const [sourceLocale = "en"] = locales;
  return I18nOptionsSchema.parse({ locales, sourceLocale });
}

describe("shadcn-direction", () => {
  test("keeps the static RTL layout when i18n is disabled", async () => {
    const vfs = await generateWeb(baseConfig({ i18n: "none", shadcn: { ...SHADCN, rtl: true } }));
    const layout = vfs.readFile("apps/web/src/app/layout.tsx") ?? "";

    expect(layout).toContain('<DirectionProvider direction="rtl">');
    expect(layout).toContain('dir="rtl"');
    expect(layout).not.toContain("LocaleDirectionProvider");
    expect(vfs.exists("apps/web/src/components/locale-direction-provider.tsx")).toBe(false);
    expect(vfs.exists("packages/i18n/src/integrations/shadcn-direction.ts")).toBe(false);
  });

  test("derives the layout direction from the locale when an RTL locale is configured", async () => {
    const vfs = await generateWeb(
      baseConfig({
        i18n: "lingui",
        i18nOptions: optionsWith(["en", "ar"]),
        shadcn: SHADCN,
      }),
    );
    const layout = vfs.readFile("apps/web/src/app/layout.tsx") ?? "";

    expect(layout).toContain(
      'import { LocaleDirectionProvider } from "@/components/locale-direction-provider";',
    );
    expect(layout).toContain("<LocaleDirectionProvider>");
    expect(layout).not.toContain('<DirectionProvider direction="rtl">');
    expect(layout).not.toContain('dir="rtl"');
  });

  test("emits the shared direction helper and the per-library provider", async () => {
    const vfs = await generateWeb(
      baseConfig({
        i18n: "lingui",
        i18nOptions: optionsWith(["en", "ar"]),
        shadcn: SHADCN,
      }),
    );

    const helper = vfs.readFile("packages/i18n/src/integrations/shadcn-direction.ts") ?? "";
    expect(helper).toContain("getTextDirection(locale)");
    expect(helper).toContain("locale === sourceLocale");

    const provider = vfs.readFile("apps/web/src/components/locale-direction-provider.tsx") ?? "";
    expect(provider).toContain("getLocaleDirection(locale)");
    expect(provider).toContain("document.documentElement.dir = direction");
    expect(provider).toContain("useLingui");
  });

  test("bakes an explicit shadcn.rtl in as the source-locale override", async () => {
    const vfs = await generateWeb(
      baseConfig({
        i18n: "i18next",
        i18nOptions: optionsWith(["en", "fr"]),
        shadcn: { ...SHADCN, rtl: true },
      }),
    );

    const helper = vfs.readFile("packages/i18n/src/integrations/shadcn-direction.ts") ?? "";
    expect(helper).toContain('= "rtl";');

    const provider = vfs.readFile("apps/web/src/components/locale-direction-provider.tsx") ?? "";
    expect(provider).toContain("useTranslation");
  });

  test("leaves the layout without direction wiring when no locale needs RTL", async () => {
    const vfs = await generateWeb(
      baseConfig({
        i18n: "lingui",
        i18nOptions: optionsWith(["en", "es", "fr"]),
        shadcn: SHADCN,
      }),
    );

    const layout = vfs.readFile("apps/web/src/app/layout.tsx") ?? "";
    expect(layout).not.toContain("DirectionProvider");
    expect(layout).not.toContain('dir="rtl"');
    expect(vfs.exists("apps/web/src/components/locale-direction-provider.tsx")).toBe(false);
  });

  test("does not wire direction without a shadcn theme", async () => {
    const vfs = await generateWeb(
      baseConfig({
        i18n: "paraglide",
        i18nOptions: optionsWith(["en", "ar"]),
      }),
    );

    const layout = vfs.readFile("apps/web/src/app/layout.tsx") ?? "";
    expect(layout).not.toContain("DirectionProvider");
    expect(layout).not.toContain('dir="rtl"');
    expect(vfs.exists("apps/web/src/components/locale-direction-provider.tsx")).toBe(false);
  });

  test("wires the react-router root with the relative provider import", async () => {
    const vfs = await generateWeb(
      baseConfig({
        frontend: ["react-router"],
        i18n: "lingui",
        i18nOptions: optionsWith(["en", "he"]),
        shadcn: SHADCN,
      }),
    );

    const root = vfs.readFile("apps/web/src/root.tsx") ?? "";
    expect(root).toContain(
      'import { LocaleDirectionProvider } from "./components/locale-direction-provider";',
    );
    expect(root).toContain("<LocaleDirectionProvider>");
    expect(root).not.toContain('dir="rtl"');
  });
});
