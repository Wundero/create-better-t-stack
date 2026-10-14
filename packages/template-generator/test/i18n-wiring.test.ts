import { describe, expect, test } from "bun:test";

import type { ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../src/core/virtual-fs";
import { processPackageConfigs } from "../src/post-process/package-configs";
import { generateNxConfig } from "../src/processors/nx-generator";
import { generateTurboConfig } from "../src/processors/turbo-generator";
import { processI18nTemplates } from "../src/template-handlers/i18n";
import { generateReproducibleCommand } from "../src/utils/reproducible-command";

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
    addons: ["turborepo"],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "none",
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

describe("reproducible command", () => {
  test("emits the i18n flags with the library, locales and non-default options", () => {
    const command = generateReproducibleCommand(
      baseConfig({
        i18n: "paraglide",
        i18nOptions: {
          sourceLocale: "fr",
          locales: ["en", "fr"],
          routing: {
            strategy: "domain",
            prefixDefaultLocale: false,
            domains: { fr: "fr.example.com" },
          },
          translateSkill: false,
        },
      }),
    );

    expect(command).toContain("--i18n paraglide");
    expect(command).toContain("--i18n-locales en,fr");
    expect(command).toContain("--i18n-source-locale fr");
    expect(command).toContain("--i18n-routing domain");
    expect(command).toContain("--i18n-domain fr=fr.example.com");
    expect(command).toContain("--no-i18n-skill");
  });

  test("omits the source-locale flag when the first locale is the source", () => {
    const command = generateReproducibleCommand(
      baseConfig({
        i18n: "lingui",
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "es"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: true,
        },
      }),
    );

    expect(command).toContain("--i18n lingui");
    expect(command).not.toContain("--i18n-source-locale");
    expect(command).not.toContain("--i18n-routing");
    expect(command).not.toContain("--no-i18n-skill");
  });

  test("emits no i18n flags when i18n is none", () => {
    expect(generateReproducibleCommand(baseConfig())).not.toContain("--i18n");
  });
});

describe("task-runner wiring", () => {
  test("turbo declares the i18n tasks without caching when i18n is enabled", () => {
    const tasks = generateTurboConfig(baseConfig({ i18n: "lingui" })).tasks;

    expect(tasks["i18n:compile"]).toEqual({ cache: false });
    expect(tasks["i18n:extract"]).toEqual({ cache: false });
  });

  test("turbo leaves the task list unchanged when i18n is none", () => {
    expect(generateTurboConfig(baseConfig()).tasks["i18n:compile"]).toBeUndefined();
  });

  test("nx declares the i18n targets without caching when i18n is enabled", () => {
    const targets = generateNxConfig(baseConfig({ i18n: "i18next" })).targetDefaults;

    expect(targets["i18n:compile"]).toEqual({ cache: false });
    expect(targets["i18n:check"]).toEqual({ cache: false });
  });
});

describe("root package scripts", () => {
  const vfsWithRootPackage = (): VirtualFileSystem => {
    const vfs = new VirtualFileSystem();
    vfs.writeJson("package.json", { name: "demo", scripts: {} });
    return vfs;
  };

  test("adds the i18n scripts and compiles before dev and build", () => {
    const vfs = vfsWithRootPackage();
    processPackageConfigs(vfs, baseConfig({ i18n: "lingui" }));

    const scripts =
      vfs.readJson<{ scripts: Record<string, string> }>("package.json")?.scripts ?? {};
    expect(scripts["i18n:extract"]).toBe("turbo run i18n:extract -F @demo/i18n --");
    expect(scripts.dev).toBe("turbo run i18n:compile -F @demo/i18n -- && turbo run dev");
    expect(scripts.build).toBe("turbo run i18n:compile -F @demo/i18n -- && turbo run build");
  });

  test("leaves the scripts unchanged when i18n is none", () => {
    const vfs = vfsWithRootPackage();
    processPackageConfigs(vfs, baseConfig());

    const scripts =
      vfs.readJson<{ scripts: Record<string, string> }>("package.json")?.scripts ?? {};
    expect(scripts["i18n:extract"]).toBeUndefined();
    expect(scripts.dev).toBe("turbo run dev");
  });
});

describe("i18n template handling", () => {
  const templates = new Map<string, string>([
    ["i18n/shared/GLOSSARY.md", "glossary"],
    ["i18n/lib/lingui/scripts/extract.ts", "extract"],
    ["i18n/surface/lingui/next/src/demo.tsx", "next-demo"],
    ["i18n/surface/lingui/native/App.tsx", "native-demo"],
    ["i18n/skill/i18n-translate/SKILL.md", "skill"],
  ]);

  test("emits the shared package, library files and per-surface glue", async () => {
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(
      vfs,
      templates,
      baseConfig({ i18n: "lingui", frontend: ["next", "native-uniwind"] }),
    );

    expect(vfs.exists("packages/i18n/GLOSSARY.md")).toBe(true);
    expect(vfs.exists("packages/i18n/scripts/extract.ts")).toBe(true);
    expect(vfs.exists("apps/web/src/demo.tsx")).toBe(true);
    expect(vfs.exists("apps/native/App.tsx")).toBe(true);
    expect(vfs.exists(".agents/skills/i18n-translate/SKILL.md")).toBe(true);
  });

  test("skips the translate skill when it is disabled", async () => {
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(
      vfs,
      templates,
      baseConfig({
        i18n: "lingui",
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: false,
        },
      }),
    );

    expect(vfs.exists(".agents/skills/i18n-translate/SKILL.md")).toBe(false);
  });

  test("writes nothing when i18n is none", async () => {
    const vfs = new VirtualFileSystem();
    await processI18nTemplates(vfs, templates, baseConfig());

    expect(vfs.getAllFiles()).toHaveLength(0);
  });
});
