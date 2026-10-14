import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { icuSignature, validateIcuSubset } from "../templates/i18n/lib/lingui/scripts/icu";
import {
  generateMessageId,
  parsePoFile,
  serializePoFile,
} from "../templates/i18n/lib/lingui/scripts/po";

const SCRIPTS_DIR = path.resolve(import.meta.dir, "../templates/i18n/lib/lingui/scripts");

const CONFIG_SOURCE = [
  'export const locales = ["en", "fr"] as const;',
  'export const sourceLocale = "en";',
  "export type Locale = (typeof locales)[number];",
  "export function isLocale(value: string): value is Locale { return locales.some((locale) => locale === value); }",
  "export function negotiateLocale(): Locale { return sourceLocale; }",
  "",
].join("\n");

const GREETING = "Hello {name}, welcome back!";
const UNREAD = "{count, plural, one {# unread message} other {# unread messages}}";
const HEADING_ID = "server.heading";

function poFile(language: string, entries: string[]): string {
  return [
    'msgid ""',
    'msgstr ""',
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=utf-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    '"X-Generator: @lingui/cli\\n"',
    `"Language: ${language}\\n"`,
    "",
    ...entries,
  ].join("\n");
}

function entry(msgid: string, msgstr: string, flags?: string, id?: string): string {
  const lines: string[] = [];
  if (id) lines.push(`#. js-lingui-id: ${id}`);
  if (flags) lines.push(`#, ${flags}`);
  lines.push(`msgid "${msgid}"`);
  lines.push(`msgstr "${msgstr}"`);
  return `${lines.join("\n")}\n\n`;
}

function makePackage(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lingui-roundtrip-"));
  const pkg = path.join(root, "pkg");
  fs.mkdirSync(path.join(pkg, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "locales", "en"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "locales", "fr"), { recursive: true });
  for (const file of fs.readdirSync(SCRIPTS_DIR)) {
    fs.copyFileSync(path.join(SCRIPTS_DIR, file), path.join(pkg, "scripts", file));
  }
  fs.writeFileSync(path.join(pkg, "src", "config.ts"), CONFIG_SOURCE);

  fs.writeFileSync(
    path.join(pkg, "locales", "en", "messages.po"),
    poFile("en", [
      entry(GREETING, GREETING),
      entry(UNREAD, UNREAD),
      entry(HEADING_ID, "Internationalization", "js-lingui-explicit-id"),
    ]),
  );
  fs.writeFileSync(
    path.join(pkg, "locales", "fr", "messages.po"),
    poFile("fr", [
      entry(GREETING, ""),
      entry(UNREAD, ""),
      entry(HEADING_ID, "", "js-lingui-explicit-id"),
    ]),
  );
  return pkg;
}

function run(pkg: string, script: string, args: string[] = []) {
  return spawnSync(process.execPath, [path.join(pkg, "scripts", script), ...args], {
    cwd: pkg,
    encoding: "utf8",
  });
}

describe("Lingui message ID parity", () => {
  test("matches the Rust t! macro vectors", () => {
    expect(generateMessageId("my message", "")).toBe("vQhkQx");
    expect(generateMessageId("my message", "custom context")).toBe("gGUeZH");
    expect(generateMessageId("Hello World", "my context")).toBe("SO_WB8");
  });
});

describe("PO parse/serialize round trip", () => {
  test("keeps entries, references and explicit-id flags", () => {
    const source = poFile("en", [
      "#: src/demo.ts:3\n" + entry(GREETING, GREETING),
      entry(HEADING_ID, "Internationalization", "js-lingui-explicit-id"),
    ]);
    const first = parsePoFile(source);
    const second = parsePoFile(serializePoFile(first));

    expect(second.headers.Language).toBe("en");
    expect(second.entries.map((item) => item.msgid)).toEqual([GREETING, HEADING_ID]);
    expect(second.entries[0]?.references).toEqual(["src/demo.ts:3"]);
    expect(second.entries[1]?.flags).toContain("js-lingui-explicit-id");
  });
});

describe("ICU subset analysis", () => {
  test("accepts plural, select, nesting and named arguments", () => {
    expect(validateIcuSubset(UNREAD)).toEqual([]);
    expect(
      validateIcuSubset(
        "{gender, select, male {He} female {She} other {They}} has {count, plural, one {# item} other {# items}}",
      ),
    ).toEqual([]);
  });

  test("rejects unsupported constructs and stray pound signs", () => {
    expect(validateIcuSubset("{value, choice, 0#zero|1#one}").length).toBeGreaterThan(0);
    expect(validateIcuSubset("Total: #").length).toBeGreaterThan(0);
  });

  test("signatures distinguish plural from simple arguments", () => {
    expect(icuSignature(UNREAD)).not.toBe(icuSignature("{count} unread messages"));
    expect(icuSignature("Hello {name}")).toBe(icuSignature("{name}, hello"));
  });
});

describe("i18n:pending / i18n:apply / i18n:export round trip", () => {
  test("pending lists only the untranslated items", () => {
    const pkg = makePackage();
    const result = run(pkg, "pending.ts", ["--all"]);

    expect(result.status).toBe(0);
    const contract = JSON.parse(result.stdout);
    expect(contract.library).toBe("lingui");
    expect(contract.sourceLocale).toBe("en");
    expect(contract.items).toHaveLength(3);
    expect(contract.items.every((item: { locale: string }) => item.locale === "fr")).toBe(true);
    expect(contract.items.map((item: { status: string }) => item.status)).toEqual([
      "missing",
      "missing",
      "missing",
    ]);
    expect(contract.items[0]?.placeholders).toEqual(["name"]);
  });

  test("apply writes valid items and rejects placeholder mismatches", () => {
    const pkg = makePackage();
    const translationFile = path.join(pkg, "translations.json");
    fs.writeFileSync(
      translationFile,
      JSON.stringify({
        items: [
          {
            id: generateMessageId(GREETING),
            locale: "fr",
            translation: "Bonjour {name}, bon retour !",
          },
          {
            id: generateMessageId(UNREAD),
            locale: "fr",
            translation: "Vous avez {count} messages.",
          },
        ],
      }),
    );

    const result = run(pkg, "apply.ts", [translationFile]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Placeholder mismatch");

    const catalog = parsePoFile(
      fs.readFileSync(path.join(pkg, "locales", "fr", "messages.po"), "utf8"),
    );
    const greeting = catalog.entries.find((item) => item.msgid === GREETING);
    const unread = catalog.entries.find((item) => item.msgid === UNREAD);
    expect(greeting?.msgstr).toBe("Bonjour {name}, bon retour !");
    expect(unread?.msgstr).toBe("");
  });

  test("export normalizes catalogs with hash and explicit IDs", () => {
    const pkg = makePackage();
    const result = run(pkg, "export.ts");
    expect(result.status).toBe(0);

    const catalog = JSON.parse(fs.readFileSync(path.join(pkg, "dist", "catalog.json"), "utf8"));
    const greetingId = generateMessageId(GREETING);
    const unreadId = generateMessageId(UNREAD);

    expect(catalog.sourceLocale).toBe("en");
    expect(catalog.locales).toEqual(["en", "fr"]);
    expect(Object.keys(catalog.messages).sort()).toEqual([HEADING_ID, unreadId, greetingId].sort());
    expect(catalog.messages[greetingId]).toEqual({
      source: GREETING,
      context: null,
      translations: { en: GREETING, fr: GREETING },
    });
    expect(catalog.messages[HEADING_ID]).toEqual({
      source: "Internationalization",
      context: null,
      translations: { en: "Internationalization", fr: "Internationalization" },
    });
  });

  test("export fails naming the message with an unsupported ICU construct", () => {
    const pkg = makePackage();
    const unsupported = "{value, choice, 0#zero|1#one}";
    fs.writeFileSync(
      path.join(pkg, "locales", "en", "messages.po"),
      poFile("en", [entry(unsupported, unsupported)]),
    );

    const result = run(pkg, "export.ts");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(generateMessageId(unsupported));
  });
});
