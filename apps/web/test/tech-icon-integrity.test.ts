import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { TECH_OPTIONS } from "../src/lib/constant";
import { hasLightVariant, lightVariantSrc } from "../src/lib/tech-icon-src";

const PUBLIC_DIR = join(import.meta.dir, "..", "public");

const entries = Object.entries(TECH_OPTIONS).flatMap(([category, options]) =>
  options.map((option) => ({ category, ...option })),
);

const localIcons = entries.filter((entry) => entry.icon.startsWith("/"));

describe("local tech icons resolve to real files", () => {
  test("at least one local icon is declared", () => {
    expect(localIcons.length).toBeGreaterThan(0);
  });

  for (const { category, id, icon } of localIcons) {
    test(`${category}.${id} -> ${icon}`, () => {
      expect(existsSync(join(PUBLIC_DIR, icon))).toBe(true);
    });

    if (hasLightVariant(icon)) {
      const lightSrc = lightVariantSrc(icon);
      test(`${category}.${id} light variant -> ${lightSrc}`, () => {
        expect(existsSync(join(PUBLIC_DIR, lightSrc))).toBe(true);
      });
    }
  }
});

describe("examples carry no icons", () => {
  for (const option of TECH_OPTIONS.examples) {
    test(`examples.${option.id} has no icon`, () => {
      expect(option.icon).toBe("");
    });
  }
});
