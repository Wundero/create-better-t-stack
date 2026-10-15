import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { SkillsAgentSchema, type ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../src/core/virtual-fs";
import { processI18nTemplates } from "../src/template-handlers/i18n";
import {
  getAgentSkillDirectory,
  getI18nSkillMirrorDirectories,
} from "../src/template-handlers/i18n-skill";
import type { TemplateData } from "../src/template-handlers/utils";

function loadI18nTemplates(): TemplateData {
  const root = path.join(import.meta.dir, "..", "templates", "i18n");
  const templates: TemplateData = new Map();

  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory)) {
      const filePath = path.join(directory, entry);
      const key = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(filePath).isDirectory()) {
        walk(filePath, key);
        continue;
      }
      templates.set(key, readFileSync(filePath, "utf8"));
    }
  };

  walk(root, "i18n");
  return templates;
}

const TEMPLATES = loadI18nTemplates();

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "none",
    orm: "none",
    backend: "none",
    runtime: "none",
    frontend: [],
    addons: [],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "lingui",
    i18nOptions: {
      sourceLocale: "en",
      locales: ["en", "fr"],
      routing: { strategy: "cookie", prefixDefaultLocale: false },
      translateSkill: true,
    },
    git: false,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "none",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

async function render(config: ProjectConfig): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem();
  await processI18nTemplates(vfs, TEMPLATES, config);
  return vfs;
}

function frontmatterName(content: string): string | undefined {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  return match?.[1]?.match(/^name:\s*(.+)$/m)?.[1]?.trim();
}

describe("i18n skills", () => {
  test("emits both skills to .agents/skills with valid frontmatter", async () => {
    const vfs = await render(baseConfig());

    for (const name of ["i18n-translate", "i18n-adopt"]) {
      const file = `.agents/skills/${name}/SKILL.md`;
      expect(vfs.exists(file)).toBe(true);
      const content = vfs.readFile(file) as string;
      expect(frontmatterName(content)).toBe(name);
      expect(content.length).toBeGreaterThan(0);
      expect(content).not.toContain("{{#if");
    }
  });

  test("renders library-specific guidance per library", async () => {
    const lingui = (await render(baseConfig({ i18n: "lingui" }))).readFile(
      ".agents/skills/i18n-adopt/SKILL.md",
    ) as string;
    const wuchale = (await render(baseConfig({ i18n: "wuchale" }))).readFile(
      ".agents/skills/i18n-adopt/SKILL.md",
    ) as string;
    const i18next = (await render(baseConfig({ i18n: "i18next" }))).readFile(
      ".agents/skills/i18n-translate/SKILL.md",
    ) as string;
    const paraglide = (await render(baseConfig({ i18n: "paraglide" }))).readFile(
      ".agents/skills/i18n-translate/SKILL.md",
    ) as string;

    expect(lingui).not.toBe(wuchale);
    expect(wuchale).toContain("wuchale.config.mjs");
    expect(lingui).toContain("@lingui/");
    expect(i18next).toContain("{{name}}");
    expect(paraglide).toContain("messages");
    for (const content of [lingui, wuchale, i18next, paraglide]) {
      expect(content).not.toContain("{{#if");
      expect(content).not.toContain("{{else");
    }
  });

  test("skips both skills when the translate-skill option is off", async () => {
    const vfs = await render(
      baseConfig({
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: false,
        },
      }),
    );

    expect(vfs.exists(".agents/skills/i18n-translate/SKILL.md")).toBe(false);
    expect(vfs.exists(".agents/skills/i18n-adopt/SKILL.md")).toBe(false);
  });

  test("writes no skills when i18n is none", async () => {
    const vfs = await render(baseConfig({ i18n: "none" }));
    expect(vfs.getAllFiles().filter((file) => file.startsWith(".agents/skills/"))).toHaveLength(0);
  });
});

describe("skills-addon mirror", () => {
  test("mirrors to .claude/skills for the default agent set", async () => {
    const config = baseConfig({ addons: ["skills"] });
    const vfs = await render(config);

    const canonical = vfs.readFile(".agents/skills/i18n-translate/SKILL.md") as string;
    const mirrored = vfs.readFile(".claude/skills/i18n-translate/SKILL.md") as string;
    expect(mirrored).toBe(canonical);
    expect(vfs.exists(".claude/skills/i18n-adopt/SKILL.md")).toBe(true);
  });

  test("mirrors to every selected agent directory without duplicates", async () => {
    const vfs = await render(
      baseConfig({
        addons: ["skills"],
        addonOptions: {
          skills: { agents: ["universal", "cursor", "claude-code", "qoder", "qoder-cn"] },
        },
      }),
    );

    expect(vfs.exists(".claude/skills/i18n-translate/SKILL.md")).toBe(true);
    expect(vfs.exists(".qoder/skills/i18n-translate/SKILL.md")).toBe(true);
    // Cursor and universal read `.agents/skills`; no extra directories.
    expect(vfs.exists(".cursor/skills/i18n-translate/SKILL.md")).toBe(false);
    const qoderCopies = vfs
      .getAllFiles()
      .filter((file) => file.startsWith(".qoder/skills/i18n-translate/"));
    expect(qoderCopies).toHaveLength(1);
  });

  test("no mirror when the skills addon is not selected or the skill is off", async () => {
    const withoutAddon = await render(baseConfig());
    expect(withoutAddon.exists(".claude/skills/i18n-translate/SKILL.md")).toBe(false);

    const withoutSkill = await render(
      baseConfig({
        addons: ["skills"],
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: { strategy: "cookie", prefixDefaultLocale: false },
          translateSkill: false,
        },
      }),
    );
    expect(withoutSkill.exists(".claude/skills/i18n-translate/SKILL.md")).toBe(false);
  });

  test("getI18nSkillMirrorDirectories follows the skills CLI mapping", () => {
    type SkillAgents = NonNullable<NonNullable<ProjectConfig["addonOptions"]>["skills"]>["agents"];
    const directories = (agents: SkillAgents) =>
      getI18nSkillMirrorDirectories(
        baseConfig({ addons: ["skills"], addonOptions: { skills: { agents } } }),
      );

    expect(directories(undefined)).toEqual([".claude/skills"]);
    expect(directories(["universal", "trae", "trae-cn", "zencoder", "zenflow"])).toEqual([
      ".trae/skills",
      ".zencoder/skills",
    ]);
    expect(directories(["openclaw", "clawdbot"])).toEqual(["skills"]);
    expect(directories(["eve"])).toEqual(["agent/skills"]);
  });

  test("classifies every SkillsAgent in the skills CLI project-scope map", () => {
    for (const agent of SkillsAgentSchema.options) {
      expect(getAgentSkillDirectory(agent).length).toBeGreaterThan(0);
    }
  });

  test("every non-universal SkillsAgent resolves to a mirror directory", () => {
    for (const agent of SkillsAgentSchema.options) {
      const directory = getAgentSkillDirectory(agent);
      const mirrors = getI18nSkillMirrorDirectories(
        baseConfig({ addons: ["skills"], addonOptions: { skills: { agents: [agent] } } }),
      );

      if (directory === ".agents/skills") {
        expect(mirrors).toEqual([]);
      } else {
        expect(mirrors).toEqual([directory]);
      }
    }
  });

  test("droid, kilo and pi read the universal location (skills@1.7.2)", () => {
    for (const agent of ["droid", "kilo", "pi"] as const) {
      expect(getAgentSkillDirectory(agent)).toBe(".agents/skills");
    }

    const directories = getI18nSkillMirrorDirectories(
      baseConfig({
        addons: ["skills"],
        addonOptions: { skills: { agents: ["droid", "kilo", "pi"] } },
      }),
    );
    expect(directories).toEqual([]);
  });
});
