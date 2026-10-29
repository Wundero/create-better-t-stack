import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { composeGlobalsCss, type ComposeGlobalsInput } from "../src/shadcn/globals";
import type { RegistryCss, RegistryCssVars, RegistryFont } from "../src/shadcn/types";

interface InitFixture {
  cssVars: RegistryCssVars;
  css?: RegistryCss;
}

interface FontFixture {
  font: RegistryFont;
}

function loadJson<T>(relativePath: string): T {
  const path = fileURLToPath(new URL(`./fixtures/shadcn/${relativePath}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

const baseMaia = loadJson<InitFixture>("init/base-maia.json");
const radixMaia = loadJson<InitFixture>("init/radix-maia.json");
const ariaMaia = loadJson<InitFixture>("init/aria-maia.json");

function loadFonts(style: string): RegistryFont[] {
  const sans = loadJson<FontFixture>(`styles/${style}/font-outfit.json`);
  const heading = loadJson<FontFixture>(`styles/${style}/font-heading-raleway.json`);
  return [sans.font, heading.font];
}

const BASE_INPUT: ComposeGlobalsInput = {
  cssVars: baseMaia.cssVars,
  css: baseMaia.css,
  fonts: loadFonts("base-maia"),
};

describe("composeGlobalsCss", () => {
  test("emits the import header before source globs and dark variant", () => {
    const css = composeGlobalsCss(BASE_INPUT);

    expect(css.startsWith("@import 'tailwindcss';\n")).toBe(true);
    expect(css).toContain("@import 'tw-animate-css';\n");
    expect(css).toContain("@import 'shadcn/tailwind.css';\n");
    expect(css).toContain('@import "@fontsource-variable/outfit";');
    expect(css).toContain('@import "@fontsource-variable/raleway";');
    expect(css).toContain('@source "../../../apps/**/*.{ts,tsx}";');
    expect(css).toContain('@source "../**/*.{ts,tsx}";');
    expect(css).toContain("@custom-variant dark (&:is(.dark *));");

    const sourceIndex = css.indexOf("@source ");
    expect(css.indexOf("@import 'tailwindcss';")).toBeLessThan(sourceIndex);
    expect(css.indexOf('@import "@fontsource-variable/outfit";')).toBeLessThan(sourceIndex);
  });

  test("renders light and dark tokens from the registry maps", () => {
    const css = composeGlobalsCss(BASE_INPUT);

    expect(css).toContain("--background: oklch(1 0 0);");
    expect(css).toContain("--background: oklch(0.147 0.004 49.3);");
    expect(css).toContain("--sidebar-ring: oklch(0.714 0.014 41.2);");
    expect(css).toContain("--radius: 0.625rem;");
    expect(css).toContain(".dark {");
  });

  test("maps colors in theme inline and derives the radius scale", () => {
    const css = composeGlobalsCss(BASE_INPUT);

    expect(css).toContain("--color-background: var(--background);");
    expect(css).toContain("--color-sidebar-ring: var(--sidebar-ring);");
    expect(css).not.toContain("--color-radius");
    expect(css).toContain("--radius-sm: calc(var(--radius) - 4px);");
    expect(css).toContain("--radius-4xl: calc(var(--radius) + 16px);");
  });

  test("uses font families for the theme font variables", () => {
    const css = composeGlobalsCss(BASE_INPUT);

    expect(css).toContain("--font-sans: 'Outfit Variable', sans-serif;");
    expect(css).toContain("--font-heading: 'Raleway Variable', sans-serif;");
  });

  test("renders the structural base layer and drops registry duplicates", () => {
    const css = composeGlobalsCss(BASE_INPUT);

    expect(css).toContain("@layer base {");
    expect(css).toContain("@apply border-border outline-ring/50;");
    expect(css).toContain("@apply font-sans bg-background text-foreground;");
    expect(css).toContain("@apply font-sans;");
    expect(css.match(/body \{/g)).toHaveLength(1);
    expect(css.match(/\* \{/g)).toHaveLength(1);
  });

  test("falls back to var(--font-sans) when no heading font is supplied", () => {
    const [sans] = loadFonts("base-maia");
    const css = composeGlobalsCss({
      cssVars: {
        light: { background: "oklch(1 0 0)" },
        theme: { "--font-heading": "var(--font-sans)" },
      },
      fonts: sans === undefined ? [] : [sans],
    });

    expect(css).toContain("--font-heading: var(--font-sans);");
    expect(css).toContain(":root {");
    expect(css).toContain("  --font-heading: var(--font-sans);");
  });

  test("emits the pointer rule only when pointer is true", () => {
    const withPointer = composeGlobalsCss({ ...BASE_INPUT, pointer: true });
    const withoutPointer = composeGlobalsCss({ ...BASE_INPUT, pointer: false });

    expect(withPointer).toContain('button:not(:disabled), [role="button"]:not(:disabled) {');
    expect(withPointer).toContain("cursor: pointer;");
    expect(withoutPointer).not.toContain("button:not(:disabled)");
  });

  test("is deterministic and preserves token order", () => {
    const first = composeGlobalsCss(BASE_INPUT);
    const second = composeGlobalsCss(BASE_INPUT);

    expect(first).toBe(second);
    expect(first.indexOf("--color-background")).toBeLessThan(first.indexOf("--color-sidebar-ring"));
    expect(first.indexOf("--radius-sm")).toBeGreaterThan(first.indexOf("--color-background"));
    expect(first.endsWith("\n")).toBe(true);
    expect(first.endsWith("\n\n")).toBe(false);
  });

  test("omits empty root and dark blocks", () => {
    const css = composeGlobalsCss({ cssVars: { light: {}, dark: {} } });

    expect(css).not.toContain(":root {");
    expect(css).not.toContain(".dark {");
    expect(css.endsWith("\n")).toBe(true);
  });

  test("composes every base fixture without error", () => {
    for (const [style, fixture] of [
      ["base-maia", baseMaia],
      ["radix-maia", radixMaia],
      ["aria-maia", ariaMaia],
    ] as const) {
      const css = composeGlobalsCss({
        cssVars: fixture.cssVars,
        css: fixture.css,
        fonts: loadFonts(style),
        pointer: true,
      });
      expect(css).toContain("--color-background: var(--background);");
      expect(css).toContain("--font-sans: 'Outfit Variable', sans-serif;");
      expect(css).toContain("@layer base {");
    }
  });
});
