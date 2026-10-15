import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ProjectConfig } from "@better-t-stack/types";

import { processTemplateString } from "../src/core/template-processor";

/**
 * Turnstile language binding (task 7.7). The widget templates are rendered
 * with `i18n`, so the binding must appear exactly when a library is selected,
 * and the emitted map must fall back to Turnstile's `"auto"` for locales
 * Turnstile does not translate.
 */

const templatesDir = fileURLToPath(new URL("../templates", import.meta.url));

const WIDGET_TEMPLATES = [
  "addons/turnstile/react/apps/web/src/components/turnstile-widget.tsx.hbs",
  "addons/turnstile/solid/apps/web/src/components/Turnstile.tsx.hbs",
  "addons/turnstile/svelte/apps/web/src/components/Turnstile.svelte.hbs",
  "addons/turnstile/nuxt/apps/web/app/components/Turnstile.client.vue.hbs",
  "addons/turnstile/astro/apps/web/src/components/Turnstile.astro.hbs",
];

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["tanstack-router"],
    addons: ["turborepo", "turnstile"],
    examples: [],
    auth: "better-auth",
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

function renderTemplate(templatePath: string, config: ProjectConfig): string {
  return processTemplateString(readFileSync(join(templatesDir, templatePath), "utf8"), config);
}

async function loadTurnstileHelper(
  config: ProjectConfig,
): Promise<{ getTurnstileLanguage: (locale: string) => string }> {
  const source = renderTemplate("i18n/integrations/turnstile/turnstile.ts.hbs", config);
  const dir = mkdtempSync(join(tmpdir(), "turnstile-i18n-"));
  try {
    const file = join(dir, "turnstile.ts");
    writeFileSync(file, source);
    return (await import(pathToFileURL(file).href)) as {
      getTurnstileLanguage: (locale: string) => string;
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("getTurnstileLanguage", () => {
  test("passes supported languages through unchanged", async () => {
    const { getTurnstileLanguage } = await loadTurnstileHelper(baseConfig());

    expect(getTurnstileLanguage("fr")).toBe("fr");
    expect(getTurnstileLanguage("zh-tw")).toBe("zh-tw");
    expect(getTurnstileLanguage("nb")).toBe("nb");
  });

  test("drops a region subtag but never a script subtag", async () => {
    const { getTurnstileLanguage } = await loadTurnstileHelper(baseConfig());

    expect(getTurnstileLanguage("en-us")).toBe("en");
    expect(getTurnstileLanguage("nb-no")).toBe("nb");
    expect(getTurnstileLanguage("zh-cn")).toBe("zh");
    expect(getTurnstileLanguage("zh-hant")).toBe("auto");
    expect(getTurnstileLanguage("zh-hans-cn")).toBe("auto");
  });

  test("falls back to auto for unsupported locales", async () => {
    const { getTurnstileLanguage } = await loadTurnstileHelper(baseConfig());

    expect(getTurnstileLanguage("bn")).toBe("auto");
    expect(getTurnstileLanguage("ca-es")).toBe("auto");
    expect(getTurnstileLanguage("auto")).toBe("auto");
  });
});

describe("Turnstile widget language binding", () => {
  test("binds every widget's language option when i18n is enabled", () => {
    for (const templatePath of WIDGET_TEMPLATES) {
      const widget = renderTemplate(templatePath, baseConfig({ i18n: "lingui" }));

      expect(widget).toContain("getTurnstileLanguage");
      expect(widget).toContain("language: turnstileLanguage(),");
    }
  });

  test("leaves every widget free of i18n imports when i18n is none", () => {
    for (const templatePath of WIDGET_TEMPLATES) {
      const widget = renderTemplate(templatePath, baseConfig({ i18n: "none" }));

      expect(widget).not.toContain("@demo/i18n");
      expect(widget).not.toContain("turnstileLanguage");
    }
  });
});
