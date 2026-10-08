import type { JsonObject } from "../core/json-types";
import {
  isJsonObject,
  isJsonString,
  type RegistryCss,
  type RegistryCssVars,
  type RegistryFont,
} from "./types";

/**
 * Inputs for {@link composeGlobalsCss}. Everything comes from the resolved
 * registry envelope: the `/init` `cssVars` + structural `css`, the resolved
 * font registry items, and the `pointer` override.
 */
export interface ComposeGlobalsInput {
  cssVars: RegistryCssVars;
  css?: RegistryCss;
  fonts?: RegistryFont[];
  pointer?: boolean;
}

const SOURCE_GLOBS = [
  '@source "../../../apps/**/*.{ts,tsx}";',
  '@source "../**/*.{ts,tsx}";',
] as const;

const BASE_LAYER_KEY = "@layer base";

const POINTER_SELECTOR = 'button:not(:disabled), [role="button"]:not(:disabled)';

/** The structural rules the generated globals file always carries. */
const CANONICAL_BASE_RULES: ReadonlyArray<{ selector: string; statements: string[] }> = [
  { selector: "*", statements: ["@apply border-border outline-ring/50;"] },
  { selector: "body", statements: ["@apply font-sans bg-background text-foreground;"] },
  { selector: "html", statements: ["@apply font-sans;"] },
];

const CANONICAL_SELECTORS: ReadonlySet<string> = new Set(
  CANONICAL_BASE_RULES.map((rule) => rule.selector),
);

const RADIUS_SCALE: ReadonlyArray<{ name: string; value: string }> = [
  { name: "--radius-sm", value: "calc(var(--radius) - 4px)" },
  { name: "--radius-md", value: "calc(var(--radius) - 2px)" },
  { name: "--radius-lg", value: "var(--radius)" },
  { name: "--radius-xl", value: "calc(var(--radius) + 4px)" },
  { name: "--radius-2xl", value: "calc(var(--radius) + 8px)" },
  { name: "--radius-3xl", value: "calc(var(--radius) + 12px)" },
  { name: "--radius-4xl", value: "calc(var(--radius) + 16px)" },
];

function normalizeTokenName(name: string): string {
  return name.startsWith("--") ? name : `--${name}`;
}

function isFontToken(name: string): boolean {
  return normalizeTokenName(name).startsWith("--font");
}

function isRadiusToken(name: string): boolean {
  return normalizeTokenName(name) === "--radius";
}

function renderCustomProperties(entries: Record<string, string>): string[] {
  return Object.entries(entries).map(([name, value]) => `${normalizeTokenName(name)}: ${value};`);
}

function collectFontDependencies(fonts: RegistryFont[]): string[] {
  const seen = new Set<string>();
  const dependencies: string[] = [];
  for (const font of fonts) {
    if (font.dependency.length === 0 || seen.has(font.dependency)) continue;
    seen.add(font.dependency);
    dependencies.push(font.dependency);
  }
  return dependencies;
}

function hasRadiusToken(...maps: ReadonlyArray<Record<string, string>>): boolean {
  return maps.some((map) => Object.keys(map).some((name) => isRadiusToken(name)));
}

function collectColorTokens(...maps: ReadonlyArray<Record<string, string>>): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const map of maps) {
    for (const name of Object.keys(map)) {
      if (isFontToken(name) || isRadiusToken(name)) continue;
      const normalized = normalizeTokenName(name);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      tokens.push(normalized);
    }
  }
  return tokens;
}

function buildRootProperties(
  light: Record<string, string>,
  theme: Record<string, string>,
): string[] {
  const lines = renderCustomProperties(light);
  const present = new Set(Object.keys(light).map((name) => normalizeTokenName(name)));
  for (const [name, value] of Object.entries(theme)) {
    const normalized = normalizeTokenName(name);
    if (present.has(normalized)) continue;
    present.add(normalized);
    lines.push(`${normalized}: ${value};`);
  }
  return lines;
}

function buildThemeInline(
  input: ComposeGlobalsInput,
  light: Record<string, string>,
  dark: Record<string, string>,
): string[] {
  const lines: string[] = [];
  const fonts = input.fonts ?? [];
  const sans = fonts.find((font) => font.variable === "--font-sans");
  const heading = fonts.find((font) => font.variable === "--font-heading");

  if (sans !== undefined) lines.push(`--font-sans: ${sans.family};`);
  lines.push(`--font-heading: ${heading?.family ?? "var(--font-sans)"};`);

  for (const token of collectColorTokens(light, dark)) {
    const bare = token.startsWith("--") ? token.slice(2) : token;
    lines.push(`--color-${bare}: var(${token});`);
  }

  if (hasRadiusToken(light, dark)) {
    for (const entry of RADIUS_SCALE) lines.push(`${entry.name}: ${entry.value};`);
  }
  return lines;
}

/**
 * Renders a selector/declaration map recursively:
 * - string value  -> `property: value;`
 * - empty object  -> bare statement (`@apply ...;`)
 * - nested object -> nested block (`selector { ... }`)
 */
function renderDeclarationBlock(declarations: JsonObject, indent: string): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(declarations)) {
    if (isJsonString(value)) {
      lines.push(`${indent}${key}: ${value};`);
      continue;
    }
    if (!isJsonObject(value)) continue;
    if (Object.keys(value).length === 0) {
      lines.push(`${indent}${key};`);
      continue;
    }
    lines.push(`${indent}${key} {`);
    lines.push(...renderDeclarationBlock(value, `${indent}  `));
    lines.push(`${indent}}`);
  }
  return lines;
}

function extractBaseLayer(css: RegistryCss | undefined): JsonObject {
  const entry = css?.[BASE_LAYER_KEY];
  return isJsonObject(entry) ? entry : {};
}

function renderBaseLayer(css: RegistryCss | undefined, pointer: boolean): string[] {
  const lines: string[] = [];
  const skip = new Set<string>(CANONICAL_SELECTORS);
  if (pointer) skip.add(POINTER_SELECTOR);

  for (const [selector, declarations] of Object.entries(extractBaseLayer(css))) {
    if (skip.has(selector) || !isJsonObject(declarations)) continue;
    lines.push(`${selector} {`);
    lines.push(...renderDeclarationBlock(declarations, "  "));
    lines.push("}");
  }

  for (const rule of CANONICAL_BASE_RULES) {
    lines.push(`${rule.selector} {`);
    for (const statement of rule.statements) lines.push(`  ${statement}`);
    lines.push("}");
  }

  if (pointer) {
    lines.push(`${POINTER_SELECTOR} {`);
    lines.push("  cursor: pointer;");
    lines.push("}");
  }
  return lines;
}

function appendBlock(lines: string[], selector: string, body: string[]): void {
  if (body.length === 0) return;
  lines.push(`${selector} {`);
  for (const line of body) lines.push(`  ${line}`);
  lines.push("}");
  lines.push("");
}

/**
 * Composes the shadcn `globals.css` for a resolved registry base. Output order
 * is deterministic: imports, source globs, dark variant, `:root`, `.dark`,
 * `@theme inline`, then `@layer base`. Registry map order is preserved for
 * custom properties so re-composing the same input yields an identical string.
 */
export function composeGlobalsCss(input: ComposeGlobalsInput): string {
  const light = input.cssVars.light ?? {};
  const dark = input.cssVars.dark ?? {};
  const theme = input.cssVars.theme ?? {};

  const lines: string[] = [];
  lines.push("@import 'tailwindcss';");
  lines.push("@import 'tw-animate-css';");
  lines.push("@import 'shadcn/tailwind.css';");
  for (const dependency of collectFontDependencies(input.fonts ?? [])) {
    lines.push(`@import "${dependency}";`);
  }
  lines.push(...SOURCE_GLOBS);
  lines.push("");
  lines.push("@custom-variant dark (&:is(.dark *));");
  lines.push("");

  appendBlock(lines, ":root", buildRootProperties(light, theme));
  appendBlock(lines, ".dark", renderCustomProperties(dark));
  appendBlock(lines, "@theme inline", buildThemeInline(input, light, dark));
  appendBlock(lines, BASE_LAYER_KEY, renderBaseLayer(input.css, input.pointer === true));

  return `${lines.join("\n").trimEnd()}\n`;
}
