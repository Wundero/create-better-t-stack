import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ProjectConfig } from "@better-t-stack/types";

import type { JsonValue } from "../src/core/json-types";
import { VirtualFileSystem } from "../src/core/virtual-fs";
import { processI18nTemplates } from "../src/template-handlers/i18n";
import type { TemplateData } from "../src/template-handlers/utils";

const TEMP_ROOTS: string[] = [];

afterAll(() => {
  for (const root of TEMP_ROOTS) rmSync(root, { recursive: true, force: true });
});

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
    i18n: "paraglide",
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

async function materialize(): Promise<string> {
  const root = mkdtempSync(path.join(os.tmpdir(), "paraglide-i18n-"));
  TEMP_ROOTS.push(root);

  const vfs = new VirtualFileSystem();
  await processI18nTemplates(vfs, TEMPLATES, baseConfig());

  for (const file of vfs.getAllFiles()) {
    if (!file.startsWith("packages/i18n/")) continue;
    const target = path.join(root, file.slice("packages/i18n/".length));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, vfs.readFile(file) as string);
  }

  return root;
}

interface ScriptResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runScript(
  root: string,
  script: string,
  args: readonly string[] = [],
  env: Record<string, string> = {},
): ScriptResult {
  const result = spawnSync("bun", [path.join("scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function readJson<T>(root: string, relativePath: string): T {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8")) as T;
}

function writeJson(root: string, relativePath: string, value: JsonValue): void {
  writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("paraglide uniform scripts", () => {
  test("extract reports the authored IDs and check passes on the shipped catalogs", async () => {
    const root = await materialize();

    const extract = runScript(root, "extract.ts");
    expect(extract.status).toBe(0);
    expect(extract.stdout).toContain('"library": "paraglide"');

    const check = runScript(root, "check.ts");
    expect(check.status).toBe(0);
    expect(check.stdout).toContain('"ok": true');
  });

  test("pending lists untranslated messages and check fails until missing is allowed", async () => {
    const root = await materialize();

    const french = readJson<Record<string, string>>(root, "messages/fr.json");
    delete french.i18n_demo_heading;
    writeJson(root, "messages/fr.json", french);

    const pending = runScript(root, "pending.ts", ["--all"]);
    expect(pending.status).toBe(0);
    const payload = JSON.parse(pending.stdout) as {
      library: string;
      sourceLocale: string;
      items: Array<Record<string, JsonValue>>;
    };
    expect(payload.library).toBe("paraglide");
    expect(payload.sourceLocale).toBe("en");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.id).toBe("i18n_demo_heading");
    expect(payload.items[0]?.locale).toBe("fr");
    expect(payload.items[0]?.status).toBe("missing");
    expect(payload.items[0]?.placeholders).toEqual([]);

    const limited = runScript(root, "pending.ts", ["--locale", "fr", "--limit", "1"]);
    expect(JSON.parse(limited.stdout)).toMatchObject({ items: [{ locale: "fr" }] });

    expect(runScript(root, "check.ts").status).toBe(1);
    expect(runScript(root, "check.ts", [], { I18N_CHECK_ALLOW_MISSING: "1" }).status).toBe(0);
  });

  test("apply writes valid items, rejects mismatched placeholders and export round-trips", async () => {
    const root = await materialize();

    const french = readJson<Record<string, string>>(root, "messages/fr.json");
    delete french.i18n_demo_heading;
    writeJson(root, "messages/fr.json", french);

    const applyFile = path.join(root, "translations.json");
    writeJson(root, "translations.json", {
      items: [
        { id: "i18n_demo_heading", locale: "fr", translation: "Démonstration i18n" },
        {
          id: "i18n_demo_interpolation",
          locale: "fr",
          translation: "Bonjour sans placeholder",
        },
        { id: "does_not_exist", locale: "fr", translation: "Inconnu" },
      ],
    });

    const apply = runScript(root, "apply.ts", [applyFile]);
    expect(apply.status).toBe(1);
    const applied = JSON.parse(apply.stdout) as {
      applied: number;
      rejected: Array<{ id: string; reason: string }>;
    };
    expect(applied.applied).toBe(1);
    expect(applied.rejected).toHaveLength(2);
    expect(applied.rejected[0]?.reason).toContain("name");

    const updated = readJson<Record<string, string>>(root, "messages/fr.json");
    expect(updated.i18n_demo_heading).toBe("Démonstration i18n");
    expect(Object.keys(updated)).toEqual(Object.keys(updated).sort());
    expect(runScript(root, "check.ts").status).toBe(0);

    const exported = runScript(root, "export.ts");
    expect(exported.status).toBe(0);

    const catalog = readJson<{
      sourceLocale: string;
      locales: string[];
      messages: Record<
        string,
        { source: string; context: null; translations: Record<string, string> }
      >;
    }>(root, "dist/catalog.json");
    expect(catalog.sourceLocale).toBe("en");
    expect(catalog.locales).toEqual(["en", "fr"]);
    expect(catalog.messages.i18n_demo_heading?.translations.fr).toBe("Démonstration i18n");
    expect(catalog.messages.i18n_demo_heading?.translations.en).toBeString();
    expect(catalog.messages.i18n_demo_heading?.context).toBeNull();

    const icu = (await import(pathToFileURL(path.join(root, "src/icu.ts")).href)) as {
      parseMessage(message: string): { ok: boolean; arguments?: Array<{ name: string }> };
      compareMessages(source: string, translation: string): { ok: boolean };
    };

    for (const message of Object.values(catalog.messages)) {
      for (const translation of Object.values(message.translations)) {
        const parsed = icu.parseMessage(translation);
        expect(parsed.ok).toBe(true);
        expect(icu.compareMessages(message.source, translation).ok).toBe(true);
      }
    }

    const plural = catalog.messages.i18n_demo_plural;
    expect(plural).toBeDefined();
    const pluralArguments = icu.parseMessage(plural?.source ?? "").arguments ?? [];
    expect(pluralArguments.map((argument) => argument.name)).toEqual(["count"]);
  });

  test("export refuses messages outside the ICU subset with the message ID", async () => {
    const root = await materialize();

    const english = readJson<Record<string, string>>(root, "messages/en.json");
    english.i18n_demo_number = "{value, number}";
    writeJson(root, "messages/en.json", english);

    const french = readJson<Record<string, string>>(root, "messages/fr.json");
    french.i18n_demo_number = "{value, number}";
    writeJson(root, "messages/fr.json", french);

    const exported = runScript(root, "export.ts");
    expect(exported.status).toBe(1);
    expect(exported.stderr).toContain("i18n_demo_number");
  });

  test("accepts the supported ICU subset and rejects the rest", async () => {
    const root = await materialize();

    const icu = (await import(pathToFileURL(path.join(root, "src/icu.ts")).href)) as {
      parseMessage(message: string): { ok: boolean; error?: string };
    };

    expect(icu.parseMessage("{count, plural, one {# item} other {# items}}").ok).toBe(true);
    expect(icu.parseMessage("# outside plural").ok).toBe(false);
    expect(icu.parseMessage("{count, plural, one {# item}}").ok).toBe(false);
  });
});
