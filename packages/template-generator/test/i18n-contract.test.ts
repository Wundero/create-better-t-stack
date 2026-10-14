import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ProjectConfig } from "@better-t-stack/types";

import { VirtualFileSystem } from "../src/core/virtual-fs";
import { processI18nTemplates } from "../src/template-handlers/i18n";
import type { TemplateData } from "../src/template-handlers/utils";
import {
  decodeApplyFile,
  isMissingAllowed,
  parsePendingReport,
  type ApplyFile,
  type PendingItem,
  type PendingReport,
} from "../templates/i18n/lib/lingui/scripts/contract";
import { parsePo, serializePo } from "../templates/i18n/lib/wuchale/scripts/po";

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

type ContractLibrary = "lingui" | "i18next" | "paraglide" | "wuchale";

function baseConfig(i18n: ContractLibrary): ProjectConfig {
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
    i18n,
    i18nOptions: {
      sourceLocale: "en",
      locales: ["en", "fr"],
      routing: { strategy: "cookie", prefixDefaultLocale: false },
      translateSkill: false,
    },
    git: false,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "none",
    webDeploy: "none",
    serverDeploy: "none",
  };
}

async function materialize(library: ContractLibrary): Promise<string> {
  const root = mkdtempSync(path.join(os.tmpdir(), `i18n-contract-${library}-`));
  TEMP_ROOTS.push(root);

  const vfs = new VirtualFileSystem();
  await processI18nTemplates(vfs, TEMPLATES, baseConfig(library));

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
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function writeFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

interface EmittedContract {
  parsePendingReport(stdout: string): PendingReport;
  decodeApplyFile(text: string, options: { sourceLocale: string }): ApplyFile;
}

/** Imports `packages/i18n/scripts/contract.ts` exactly as the generated project ships it. */
async function importEmittedContract(root: string): Promise<EmittedContract> {
  return (await import(
    pathToFileURL(path.join(root, "scripts", "contract.ts")).href
  )) as EmittedContract;
}

function writeApplyFile(root: string, items: readonly Record<string, string>[]): string {
  const file = path.join(root, "translations.json");
  writeFileSync(file, `${JSON.stringify({ items }, null, 2)}\n`);
  return file;
}

function pending(root: string, args: readonly string[] = ["--all"]): PendingReport {
  const result = runScript(root, "pending.ts", args);
  expect(result.status).toBe(0);
  return parsePendingReport(result.stdout);
}

interface ContractFixture {
  readonly name: ContractLibrary;
  /** Writes the fixture catalogs after the package is materialized. */
  prepare(root: string): void;
  /** A translation that changes the text but keeps every placeholder. */
  validTranslation(source: string): string;
  /** A translation with an extra placeholder in this library's dialect. */
  invalidTranslation(source: string): string;
  /** Writes a catalog entry that is invalid independently of `allowMissing`. */
  seedInvalidEntry(root: string, item: PendingItem): void;
  /**
   * `true` when `i18n:check` validates catalogs in the script itself.
   * Lingui delegates `check` to `@lingui/cli`, so its fixture stubs the CLI.
   */
  readonly checkOwnedByScript: boolean;
}

const GREETING = "Hello {name}, welcome back!";
const SETTINGS = "Settings";

function linguiPoFile(language: string, entries: readonly (readonly [string, string])[]): string {
  return [
    'msgid ""',
    'msgstr ""',
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=utf-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    `"Language: ${language}\\n"`,
    "",
    ...entries.flatMap(([msgid, msgstr]) => [`msgid "${msgid}"`, `msgstr "${msgstr}"`, ""]),
  ].join("\n");
}

function linguiFixture(): ContractFixture {
  return {
    name: "lingui",
    checkOwnedByScript: false,
    prepare(root) {
      writeFile(
        root,
        "locales/en/messages.po",
        linguiPoFile("en", [
          [GREETING, GREETING],
          [SETTINGS, SETTINGS],
        ]),
      );
      writeFile(
        root,
        "locales/fr/messages.po",
        linguiPoFile("fr", [
          [GREETING, ""],
          [SETTINGS, ""],
        ]),
      );
      // `i18n:check` delegates to @lingui/cli. The stub keeps the contract
      // test deterministic without the real CLI: `check missing` reports
      // missing translations, `check sync` succeeds unless told otherwise.
      writeFile(
        root,
        "node_modules/lingui-contract-stub/index.js",
        [
          "const [command, subcommand] = process.argv.slice(2);",
          'if (command === "check" && subcommand === "missing") process.exit(1);',
          'if (command === "check" && subcommand === "sync" && process.env.I18N_CONTRACT_STUB_SYNC_FAIL === "1") process.exit(1);',
          "process.exit(0);",
          "",
        ].join("\n"),
      );
      mkdirSync(path.join(root, "node_modules", ".bin"), { recursive: true });
      symlinkSync(
        path.join(root, "node_modules", "lingui-contract-stub", "index.js"),
        path.join(root, "node_modules", ".bin", "lingui"),
      );
    },
    validTranslation: (source) => `${source} (fr)`,
    invalidTranslation: (source) => `${source} {contractExtra}`,
    seedInvalidEntry() {
      // Lingui's check is CLI-owned; the stub's exit codes cover the contract.
    },
  };
}

function i18nextFixture(): ContractFixture {
  const greeting = "Hello {{name}}, welcome back!";
  const source = {
    [greeting]: greeting,
    [SETTINGS]: SETTINGS,
  };
  return {
    name: "i18next",
    checkOwnedByScript: true,
    prepare(root) {
      writeFile(root, "locales/en/common.json", `${JSON.stringify(source, null, 2)}\n`);
    },
    validTranslation: (text) => `${text} (fr)`,
    invalidTranslation: (text) => `${text} {{contractExtra}}`,
    seedInvalidEntry(root, item) {
      writeFile(
        root,
        "locales/fr/common.json",
        `${JSON.stringify({ [item.id]: `${item.source} {{contractExtra}}` }, null, 2)}\n`,
      );
    },
  };
}

function paraglideFixture(): ContractFixture {
  const source = {
    contract_greeting: GREETING,
    contract_settings: SETTINGS,
  };
  return {
    name: "paraglide",
    checkOwnedByScript: true,
    prepare(root) {
      writeFile(
        root,
        "project.inlang/settings.json",
        `${JSON.stringify({ baseLocale: "en", locales: ["en", "fr"] }, null, 2)}\n`,
      );
      writeFile(root, "messages/en.json", `${JSON.stringify(source, null, 2)}\n`);
      writeFile(root, "messages/fr.json", "{}\n");
    },
    validTranslation: (text) => `${text} (fr)`,
    invalidTranslation: (text) => `${text} {contractExtra}`,
    seedInvalidEntry(root, item) {
      writeFile(
        root,
        "messages/fr.json",
        `${JSON.stringify({ [item.id]: `${item.source} {contractExtra}` }, null, 2)}\n`,
      );
    },
  };
}

const WUCHALE_GREETING = "Hello {0}, welcome back!";

function wuchalePo(language: string, entries: readonly (readonly [string, string])[]): string {
  return [
    "# wuchale contract fixture",
    'msgid ""',
    'msgstr ""',
    `"Language: ${language}\\n"`,
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
    '"X-Plurals-Order: one, other;\\n"',
    "",
    ...entries.flatMap(([msgid, msgstr]) => [`msgid "${msgid}"`, `msgstr "${msgstr}"`, ""]),
  ].join("\n");
}

function wuchaleFixture(): ContractFixture {
  return {
    name: "wuchale",
    checkOwnedByScript: true,
    prepare(root) {
      writeFile(
        root,
        "locales/web.en.po",
        wuchalePo("en", [
          [WUCHALE_GREETING, WUCHALE_GREETING],
          [SETTINGS, SETTINGS],
        ]),
      );
      writeFile(
        root,
        "locales/web.fr.po",
        wuchalePo("fr", [
          [WUCHALE_GREETING, ""],
          [SETTINGS, ""],
        ]),
      );
    },
    validTranslation: (text) => `${text} (fr)`,
    invalidTranslation: (text) => `${text} {99}`,
    seedInvalidEntry(root, item) {
      const file = path.join(root, "locales", "web.fr.po");
      const catalog = parsePo(readFileSync(file, "utf8"));
      const entry = catalog.items.find((candidate) => candidate.id === item.id);
      if (!entry) throw new Error(`fixture item ${item.id} is missing from web.fr.po`);
      entry.translations = [`${item.source} {99}`];
      writeFileSync(file, serializePo(catalog));
    },
  };
}

const FIXTURES: readonly ContractFixture[] = [
  linguiFixture(),
  i18nextFixture(),
  paraglideFixture(),
  wuchaleFixture(),
];

async function setup(fixture: ContractFixture): Promise<string> {
  const root = await materialize(fixture.name);
  fixture.prepare(root);
  return root;
}

/** pending: the uniform envelope and the argument handling. */
async function assertPendingEnvelope(fixture: ContractFixture, root: string): Promise<void> {
  const report = pending(root);
  expect(report.library).toBe(fixture.name);
  expect(report.sourceLocale).toBe("en");
  expect(report.items.length).toBeGreaterThan(0);
  expect(report.items.every((item) => item.locale === "fr")).toBe(true);
  const first = report.items[0];
  expect(first?.placeholders.length).toBeGreaterThan(0);
  expect(first?.status).toBeTruthy();

  const limited = pending(root, ["--all", "--limit", "1"]);
  expect(limited.items).toHaveLength(1);

  const frenchOnly = pending(root, ["--locale", "fr"]);
  expect(frenchOnly.items.length).toBeGreaterThan(0);
  expect(frenchOnly.items.every((item) => item.locale === "fr")).toBe(true);
}

/** apply: the canonical `{ items: [{ id, locale, translation }] }` file. */
async function assertApplyAcceptsCanonicalFile(
  fixture: ContractFixture,
  root: string,
): Promise<void> {
  const item = pending(root).items[0];
  if (!item) throw new Error("fixture has no pending item");
  const file = writeApplyFile(root, [
    { id: item.id, locale: item.locale, translation: fixture.validTranslation(item.source) },
  ]);

  // The shipped helper must accept exactly what the skill writes.
  decodeApplyFile(readFileSync(file, "utf8"), { sourceLocale: "en" });

  const applied = runScript(root, "apply.ts", [file]);
  expect(applied.status).toBe(0);

  const after = pending(root);
  expect(after.items.some((entry) => entry.id === item.id && entry.locale === item.locale)).toBe(
    false,
  );
}

/** apply: placeholder protection from the spec's `Agent translation workflow`. */
async function assertApplyRejectsMismatch(fixture: ContractFixture, root: string): Promise<void> {
  const item = pending(root).items[0];
  if (!item) throw new Error("fixture has no pending item");
  const file = writeApplyFile(root, [
    { id: item.id, locale: item.locale, translation: fixture.invalidTranslation(item.source) },
  ]);

  const applied = runScript(root, "apply.ts", [file]);
  expect(applied.status).not.toBe(0);

  const after = pending(root);
  expect(after.items.some((entry) => entry.id === item.id && entry.locale === item.locale)).toBe(
    true,
  );
}

/** check: exit codes and `I18N_CHECK_ALLOW_MISSING`. */
async function assertCheckExitCodes(fixture: ContractFixture, root: string): Promise<void> {
  expect(isMissingAllowed({ I18N_CHECK_ALLOW_MISSING: "1" })).toBe(true);
  expect(isMissingAllowed({})).toBe(false);

  expect(runScript(root, "check.ts").status).toBe(1);
  expect(runScript(root, "check.ts", [], { I18N_CHECK_ALLOW_MISSING: "1" }).status).toBe(0);

  if (fixture.checkOwnedByScript) {
    const item = pending(root).items[0];
    if (!item) throw new Error("fixture has no pending item");
    fixture.seedInvalidEntry(root, item);
    expect(runScript(root, "check.ts", [], { I18N_CHECK_ALLOW_MISSING: "1" }).status).toBe(1);
  } else {
    // Lingui's `check` delegates to @lingui/cli: a failing sync pass must
    // still fail even when missing translations are allowed.
    expect(
      runScript(root, "check.ts", [], {
        I18N_CHECK_ALLOW_MISSING: "1",
        I18N_CONTRACT_STUB_SYNC_FAIL: "1",
      }).status,
    ).toBe(1);
  }
}

describe("uniform i18n script contract", () => {
  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      test("i18n:pending emits the D8 envelope and honors --locale/--limit", async () => {
        await assertPendingEnvelope(fixture, await setup(fixture));
      });

      test("i18n:apply accepts the canonical file shape", async () => {
        await assertApplyAcceptsCanonicalFile(fixture, await setup(fixture));
      });

      test("i18n:apply rejects placeholder mismatches and keeps the entry pending", async () => {
        await assertApplyRejectsMismatch(fixture, await setup(fixture));
      });

      test("i18n:check enforces missing and invalid entries", async () => {
        await assertCheckExitCodes(fixture, await setup(fixture));
      });
    });
  }
});

/**
 * Conformance of the emitted `packages/i18n/scripts/contract.ts` with the
 * runtime scripts beside it.
 *
 * Residual duplication (recorded for the orchestrator): the L5 `pending`/
 * `apply`/`check` scripts re-declare their own interfaces instead of importing
 * this helper, so nothing in the generated project links the two. These tests
 * close the gap from the outside: every library's real script output must
 * decode under the helper that is actually emitted next to it.
 */
describe("emitted contract conformance", () => {
  for (const fixture of FIXTURES) {
    test(`${fixture.name}: emitted contract decodes runtime pending and apply payloads`, async () => {
      const root = await setup(fixture);

      const emittedCopy = readFileSync(path.join(root, "scripts", "contract.ts"), "utf8");
      expect(emittedCopy).toBe(
        readFileSync(
          path.join(
            import.meta.dir,
            "..",
            "templates",
            "i18n",
            "lib",
            fixture.name,
            "scripts",
            "contract.ts",
          ),
          "utf8",
        ),
      );

      const contract = await importEmittedContract(root);

      const pendingResult = runScript(root, "pending.ts", ["--all"]);
      expect(pendingResult.status).toBe(0);
      const report = contract.parsePendingReport(pendingResult.stdout);
      expect(report.library).toBe(fixture.name);
      expect(report.sourceLocale).toBe("en");
      expect(report.items.length).toBeGreaterThan(0);

      const items = report.items.map((item) => ({
        id: item.id,
        locale: item.locale,
        translation: fixture.validTranslation(item.source),
      }));
      const decoded = contract.decodeApplyFile(JSON.stringify({ items }), {
        sourceLocale: report.sourceLocale,
      });
      const file = path.join(root, "conformance-apply.json");
      writeFileSync(file, JSON.stringify(decoded, null, 2));

      expect(runScript(root, "apply.ts", [file]).status).toBe(0);

      const after = runScript(root, "pending.ts", ["--all"]);
      expect(after.status).toBe(0);
      expect(contract.parsePendingReport(after.stdout).items).toHaveLength(0);
    });
  }
});

describe("shared contract helper", () => {
  test("ships identical copies next to every library's scripts", () => {
    const copies = (["lingui", "i18next", "paraglide", "wuchale"] as const).map((library) =>
      readFileSync(
        path.join(
          import.meta.dir,
          "..",
          "templates",
          "i18n",
          "lib",
          library,
          "scripts",
          "contract.ts",
        ),
        "utf8",
      ),
    );
    expect(new Set(copies).size).toBe(1);
  });

  test("decodeApplyFile rejects bare arrays, source-locale items and empty batches", () => {
    const options = { sourceLocale: "en" };
    expect(() => decodeApplyFile("[]", options)).toThrow("items");

    const sourceLocaleItem = JSON.stringify({
      items: [{ id: "a", locale: "en", translation: "x" }],
    });
    expect(() => decodeApplyFile(sourceLocaleItem, options)).toThrow("source locale");

    expect(() => decodeApplyFile(JSON.stringify({ items: [] }), options)).toThrow("at least one");

    const duplicate = JSON.stringify({
      items: [
        { id: "a", locale: "fr", translation: "x" },
        { id: "a", locale: "fr", translation: "y" },
      ],
    });
    expect(() => decodeApplyFile(duplicate, options)).toThrow("duplicates");
  });

  test("parsePendingReport rejects malformed envelopes", () => {
    expect(() => parsePendingReport("not json")).toThrow();
    expect(() => parsePendingReport(JSON.stringify({ library: "lingui" }))).toThrow("items");
    expect(() =>
      parsePendingReport(
        JSON.stringify({
          library: "lingui",
          sourceLocale: "en",
          items: [{ id: "a" }],
        }),
      ),
    ).toThrow("items[0]");
  });
});
