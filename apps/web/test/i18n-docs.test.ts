import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { I18N_SUPPORT, type I18nLibrary } from "@better-t-stack/types";

const DOCS_PATH = path.join(import.meta.dir, "../content/docs/cli/compatibility.mdx");
const LIBRARIES = [
  "lingui",
  "paraglide",
  "i18next",
  "wuchale",
] as const satisfies readonly I18nLibrary[];

function supportTableSection(): string {
  const content = readFileSync(DOCS_PATH, "utf8");
  const start = content.indexOf("### Library and Surface Support");
  expect(start, "compatibility.mdx is missing the i18n support-table section").toBeGreaterThan(-1);
  const rest = content.slice(start);
  const end = rest.indexOf("\n### ", "### Library and Surface Support".length);
  return end === -1 ? rest : rest.slice(0, end);
}

function parseSupportTable(section: string): Map<string, Record<I18nLibrary, string>> {
  const rows = new Map<string, Record<I18nLibrary, string>>();
  for (const line of section.split("\n")) {
    const match = /^\|\s*`([^`]+)`\s*\|(.+)\|\s*$/.exec(line);
    if (match === null) continue;
    const cells = match[2]!.split("|").map((cell) => cell.trim());
    if (cells.length !== LIBRARIES.length) continue;
    rows.set(
      match[1]!,
      Object.fromEntries(LIBRARIES.map((library, index) => [library, cells[index]!])) as Record<
        I18nLibrary,
        string
      >,
    );
  }
  return rows;
}

describe("i18n compatibility docs", () => {
  test("lists the support table header with every library column", () => {
    const header = supportTableSection()
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^\|\s*surface\s*\|/.test(line));
    const headerCells = header
      ?.split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    expect(headerCells).toEqual(["surface", ...LIBRARIES]);
  });

  test("the support table mirrors I18N_SUPPORT exactly", () => {
    const rows = parseSupportTable(supportTableSection());
    const surfaces = Object.keys(I18N_SUPPORT.lingui) as Array<keyof typeof I18N_SUPPORT.lingui>;

    expect(rows.size).toBe(surfaces.length);
    expect([...rows.keys()].sort()).toEqual([...surfaces].sort());

    for (const surface of surfaces) {
      for (const library of LIBRARIES) {
        expect(
          rows.get(surface)?.[library],
          `${library}/${surface} drifted from I18N_SUPPORT`,
        ).toBe(I18N_SUPPORT[library][surface].level);
      }
    }
  });
});
