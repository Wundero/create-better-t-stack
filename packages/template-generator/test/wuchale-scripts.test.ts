import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProjectConfig } from "@better-t-stack/types";

import { processTemplateString } from "../src/core/template-processor";
import {
  collectPendingItems,
  messagePlaceholders,
  parseCatalogFileName,
  pluralCategories,
  validatePlaceholders,
  type CatalogRead,
} from "../templates/i18n/lib/wuchale/scripts/catalog";
import { parsePo, serializePo, type PoItem } from "../templates/i18n/lib/wuchale/scripts/po";

const templatesDir = fileURLToPath(new URL("../templates/i18n", import.meta.url));

function item(overrides: Partial<PoItem>): PoItem {
  return {
    comments: [],
    extracted: [],
    references: [],
    flags: [],
    context: null,
    id: "",
    pluralId: null,
    translations: [],
    obsolete: false,
    ...overrides,
  };
}

const EN_CATALOG = `# wuchale source catalog
msgid ""
msgstr ""
"Project-Id-Version: demo\\n"
"Language: en\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"
"X-Plurals-Order: one, other;\\n"

#. greeting
#: apps/web/src/routes/i18n-demo.tsx
msgid "Welcome"
msgstr "Welcome"

msgid "Hello {0}!"
msgstr "Hello {0}!"

msgctxt "cart"
msgid "One item"
msgid_plural "# items"
msgstr[0] "One item"
msgstr[1] "# items"
`;

const FR_CATALOG = `# wuchale translation catalog
msgid ""
msgstr ""
"Project-Id-Version: demo\\n"
"Language: fr\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=3; plural=(n > 1);\\n"
"X-Plurals-Order: one, many, other;\\n"

#. greeting
#: apps/web/src/routes/i18n-demo.tsx
msgid "Welcome"
msgstr ""

msgid "Hello {0}!"
msgstr ""

msgctxt "cart"
msgid "One item"
msgid_plural "# items"
msgstr[0] ""
msgstr[1] ""
msgstr[2] ""
`;

function catalogReads(): CatalogRead[] {
  return [
    {
      source: { adapter: "web", locale: "en", path: "/tmp/demo/locales/web.en.po" },
      catalog: parsePo(EN_CATALOG),
    },
    {
      source: { adapter: "web", locale: "fr", path: "/tmp/demo/locales/web.fr.po" },
      catalog: parsePo(FR_CATALOG),
    },
  ];
}

function baseConfig(): ProjectConfig {
  return {
    projectName: "demo",
    projectDir: "/tmp/demo",
    relativePath: "demo",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["svelte"],
    addons: ["turborepo"],
    examples: [],
    auth: "none",
    payments: "none",
    i18n: "wuchale",
    i18nOptions: {
      sourceLocale: "en",
      locales: ["en", "fr"],
      routing: { strategy: "cookie" },
    },
    git: true,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
  };
}

async function createTempPackage(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wuchale-scripts-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "scripts"), { recursive: true });
  await mkdir(join(dir, "locales"), { recursive: true });

  const sharedConfig = await readFile(`${templatesDir}/shared/src/config.ts.hbs`, "utf8");
  await writeFile(join(dir, "src/config.ts"), processTemplateString(sharedConfig, baseConfig()));

  for (const name of ["po.ts", "catalog.ts"]) {
    await copyFile(`${templatesDir}/lib/wuchale/scripts/${name}`, join(dir, "scripts", name));
  }
  for (const name of ["extract", "compile", "pending", "apply", "check"]) {
    const template = await readFile(`${templatesDir}/lib/wuchale/scripts/${name}.ts.hbs`, "utf8");
    await writeFile(
      join(dir, "scripts", `${name}.ts`),
      processTemplateString(template, baseConfig()),
    );
  }

  await writeFile(join(dir, "locales/web.en.po"), EN_CATALOG);
  await writeFile(join(dir, "locales/web.fr.po"), FR_CATALOG);
  return dir;
}

function runScript(cwd: string, script: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [join(cwd, "scripts", script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("PO catalogs", () => {
  test("parse and serialize round-trip keeps every item and comment", () => {
    const parsed = parsePo(FR_CATALOG);
    const reparsed = parsePo(serializePo(parsed));

    expect(reparsed.headers.length).toBeGreaterThan(0);
    expect(reparsed.items).toHaveLength(parsed.items.length);
    expect(reparsed.items[2]?.pluralId).toBe("# items");
    expect(reparsed.items[2]?.translations).toHaveLength(3);
    expect(reparsed.items[0]?.extracted).toEqual(["greeting"]);
    expect(reparsed.items[0]?.references).toEqual(["apps/web/src/routes/i18n-demo.tsx"]);
  });

  test("parses the adapter and locale from a catalog file name", () => {
    expect(parseCatalogFileName("web.fr.po")).toEqual({ adapter: "web", locale: "fr" });
    expect(parseCatalogFileName("electrobun-host.zh-Hans.po")).toEqual({
      adapter: "electrobun-host",
      locale: "zh-Hans",
    });
    expect(parseCatalogFileName("web.fr.json")).toBeNull();
  });
});

describe("placeholder validation", () => {
  test("extracts positional placeholders", () => {
    expect(messagePlaceholders("Hello {0}, you have {1} items")).toEqual(["0", "1"]);
    expect(messagePlaceholders("No placeholders")).toEqual([]);
  });

  test("accepts a translation that keeps the source placeholders", () => {
    const greeting = item({ id: "Hello {0}!" });
    expect(validatePlaceholders(greeting, ["Bonjour {0} !"])).toBeNull();
  });

  test("rejects a translation that drops or invents a placeholder", () => {
    const greeting = item({ id: "Hello {0}!" });
    const missing = validatePlaceholders(greeting, ["Bonjour !"]);
    expect(missing).toContain("missing {0}");

    const extra = validatePlaceholders(greeting, ["Bonjour {0} {1} !"]);
    expect(extra).toContain("unexpected {1}");
  });
});

describe("pending report", () => {
  test("lists only untranslated items for the requested locale", () => {
    const pending = collectPendingItems(catalogReads(), "en", "fr");

    expect(pending.map((entry) => entry.id).sort()).toEqual([
      "Hello {0}!",
      "Welcome",
      "cart|One item",
    ]);
    expect(pending.every((entry) => entry.locale === "fr")).toBe(true);
    expect(pending[0]?.status).toBe("pending");
    expect(pending[0]?.placeholders).toBeDefined();
  });
});

describe("script contract end to end", () => {
  test("pending, apply and check run against the catalogs", async () => {
    const dir = await createTempPackage();
    try {
      // Given catalogs with untranslated fr entries
      const pendingRun = runScript(dir, "pending.ts", ["--locale", "fr"]);
      expect(pendingRun.status).toBe(0);
      const report = JSON.parse(pendingRun.stdout) as {
        library: string;
        items: { id: string; locale: string }[];
      };
      expect(report.library).toBe("wuchale");
      expect(report.items).toHaveLength(3);

      // When a translation file is applied
      const forms = Array.from({ length: pluralCategories("fr").length }, (_value, index) =>
        index === 0 ? "Un article" : "# articles",
      );
      const applyFile = join(dir, "apply.json");
      await writeFile(
        applyFile,
        JSON.stringify({
          items: [
            { id: "Welcome", locale: "fr", translation: "Bienvenue" },
            { id: "Hello {0}!", locale: "fr", translation: "Bonjour {0} !" },
            { id: "cart|One item", locale: "fr", translations: forms },
          ],
        }),
      );
      const applyRun = runScript(dir, "apply.ts", [applyFile]);
      expect(applyRun.status).toBe(0);

      // Then check passes without the allow-missing escape hatch
      const checkRun = runScript(dir, "check.ts", []);
      expect(checkRun.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("apply rejects a placeholder mismatch and leaves the entry pending", async () => {
    const dir = await createTempPackage();
    try {
      const applyFile = join(dir, "bad.json");
      await writeFile(
        applyFile,
        JSON.stringify({ items: [{ id: "Hello {0}!", locale: "fr", translation: "Bonjour !" }] }),
      );

      const applyRun = runScript(dir, "apply.ts", [applyFile]);
      expect(applyRun.status).toBe(1);
      const outcome = JSON.parse(applyRun.stdout) as { rejected: { error: string }[] };
      expect(outcome.rejected[0]?.error).toContain("missing {0}");

      const after = await readFile(join(dir, "locales/web.fr.po"), "utf8");
      expect(after).toContain('msgid "Hello {0}!"\nmsgstr ""');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("check fails on missing translations unless I18N_CHECK_ALLOW_MISSING is set", async () => {
    const dir = await createTempPackage();
    try {
      const strict = runScript(dir, "check.ts", []);
      expect(strict.status).toBe(1);
      const errors = JSON.parse(strict.stdout) as { errors: { kind: string }[] };
      expect(errors.errors.every((entry) => entry.kind === "missing")).toBe(true);

      const relaxed = runScript(dir, "check.ts", [], { I18N_CHECK_ALLOW_MISSING: "1" });
      expect(relaxed.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
