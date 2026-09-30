import { TaggedError } from "better-result";
import type { Result } from "better-result";

import type { JsonObject, JsonValue } from "../core/json-types";

// ============================================================================
// Taxonomy (values accepted by the shadcn registry)
// ============================================================================

export type ShadcnBase = "base" | "radix" | "aria";

export type ShadcnStyle = "nova" | "vega" | "maia" | "lyra" | "mira" | "luma" | "sera" | "rhea";

export type ShadcnBaseColor =
  | "neutral"
  | "stone"
  | "zinc"
  | "gray"
  | "mauve"
  | "olive"
  | "mist"
  | "taupe";

export type ShadcnTheme =
  | "neutral"
  | "stone"
  | "zinc"
  | "gray"
  | "amber"
  | "blue"
  | "cyan"
  | "emerald"
  | "fuchsia"
  | "green"
  | "indigo"
  | "lime"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "rose"
  | "sky"
  | "teal"
  | "violet"
  | "yellow"
  | "mauve"
  | "olive"
  | "mist"
  | "taupe";

export type ShadcnIconLibrary = "lucide" | "hugeicons" | "tabler" | "phosphor" | "remixicon";

export type ShadcnRadius = "default" | "none" | "small" | "medium" | "large";

export type ShadcnMenuColor =
  | "default"
  | "default-translucent"
  | "inverted"
  | "inverted-translucent";

export type ShadcnMenuAccent = "subtle" | "default" | "bold";

// ============================================================================
// Registry wire shapes
// ============================================================================

export type RegistryItemType =
  | "registry:ui"
  | "registry:lib"
  | "registry:block"
  | "registry:component"
  | "registry:file"
  | "registry:hook"
  | "registry:style"
  | "registry:theme"
  | "registry:font"
  | "registry:base"
  | "registry:page"
  | "registry:example";

export interface RegistryFile {
  path: string;
  content: string;
  type: RegistryItemType;
  target?: string;
}

/**
 * Structural CSS the registry emits, keyed by selector. Values are registry
 * tokens (`@apply ...;`), nested selector maps, or empty objects for bare
 * statements. `JsonObject` is the parsed boundary representation; the composer
 * narrows it explicitly while rendering.
 */
export type RegistryCss = JsonObject;

export interface RegistryCssVars {
  theme?: Record<string, string>;
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

export interface RegistryBaseConfig {
  style: string;
  tailwind: { baseColor: string };
  iconLibrary: string;
  rtl: boolean;
  menuColor: string;
  menuAccent: string;
}

export interface RegistryItemMeta {
  links?: { docs?: string; examples?: string };
  [key: string]: JsonValue | undefined;
}

/**
 * A `registry:base` item returned by `GET /init`. This is the merged base +
 * theme envelope: dependencies, theme css variables, structural css and config.
 * It has no `files`.
 */
export interface RegistryBase {
  extends: string;
  name: string;
  dependencies: string[];
  registryDependencies: string[];
  cssVars: RegistryCssVars;
  css?: RegistryCss;
  type: "registry:base";
  config: RegistryBaseConfig;
}

/**
 * A generic registry item (component, lib, hook, font, ...). Font items omit
 * `files` and carry a `font` block; narrow with `isRegistryFontItem`.
 */
export interface RegistryItem {
  name: string;
  type: RegistryItemType;
  title?: string;
  files?: RegistryFile[];
  dependencies?: string[];
  registryDependencies?: string[];
  cssVars?: RegistryCssVars;
  css?: RegistryCss;
  config?: RegistryBaseConfig;
  extends?: string;
  meta?: RegistryItemMeta;
  font?: RegistryFont;
}

export interface RegistryFont {
  family: string;
  provider: string;
  import: string;
  variable: string;
  subsets: string[];
  dependency: string;
}

export type RegistryFontItem = RegistryItem & {
  type: "registry:font";
  font: RegistryFont;
};

// ============================================================================
// Inputs
// ============================================================================

/**
 * Full query parameter set for `GET /init`. `preset` (a base62 bit-packed
 * theme code) is authoritative: when present the registry derives style, theme,
 * fonts, icon library, radius and menu settings from it, and `base`, `rtl` and
 * `pointer` act as overrides.
 */
export interface ResolveBaseInput {
  base: ShadcnBase;
  style: ShadcnStyle;
  baseColor: ShadcnBaseColor;
  theme: ShadcnTheme;
  iconLibrary: ShadcnIconLibrary;
  font: string;
  radius: ShadcnRadius;
  menuColor?: ShadcnMenuColor;
  menuAccent?: ShadcnMenuAccent;
  fontHeading?: string;
  chartColor?: string;
  rtl?: boolean;
  pointer?: boolean;
  preset?: string;
  template?: string;
  only?: string;
}

// ============================================================================
// Errors
// ============================================================================

export class ShadcnRegistryError extends TaggedError("ShadcnRegistryError")<{
  message: string;
  url: string;
  status: number | null;
  cause?: unknown;
}> {}

// ============================================================================
// Client contract
// ============================================================================

export interface ShadcnRegistryClient {
  resolveBase(input: ResolveBaseInput): Promise<Result<RegistryBase, ShadcnRegistryError>>;
  getItem(style: string, name: string): Promise<Result<RegistryItem, ShadcnRegistryError>>;
}

// ============================================================================
// Boundary decoding (parse, don't validate: JsonValue -> typed domain shape)
// ============================================================================

const JSON_OBJECT_TAG = "[object Object]";
const JSON_STRING_TAG = "[object String]";

/**
 * Values the registry decoders accept: a raw parsed `JsonValue` from the wire,
 * or an already-decoded registry item read back from the client cache.
 */
export type RegistryDecodeInput = JsonValue | RegistryBase | RegistryItem | RegistryFontItem;

/**
 * The shadcn registry is external I/O: its payloads are decoded from JSON once,
 * in this module, before any other code touches them. These predicates are the
 * single decode seam. They brand-check with `Object.prototype.toString` (the
 * canonical runtime type tag) rather than the `typeof` operator, which the
 * anti-slop lint reserves for callers that would otherwise hand-narrow unparsed
 * values instead of decoding them.
 */
export function isJsonObject(value: RegistryDecodeInput | undefined): value is JsonObject {
  return Object.prototype.toString.call(value) === JSON_OBJECT_TAG;
}

export function isJsonString(value: RegistryDecodeInput | undefined): value is string {
  return Object.prototype.toString.call(value) === JSON_STRING_TAG;
}

export function isJsonStringArray(value: RegistryDecodeInput | undefined): value is string[] {
  return Array.isArray(value) && value.every((entry) => isJsonString(entry));
}

export function isRegistryBase(value: RegistryDecodeInput | undefined): value is RegistryBase {
  if (!isJsonObject(value)) return false;
  if (value["type"] !== "registry:base") return false;
  if (!isJsonString(value["name"])) return false;
  if (!isJsonStringArray(value["dependencies"])) return false;
  if (!isJsonStringArray(value["registryDependencies"])) return false;
  if (!isJsonObject(value["cssVars"])) return false;
  if (!isJsonObject(value["config"])) return false;
  return true;
}

export function isRegistryItem(value: RegistryDecodeInput | undefined): value is RegistryItem {
  if (!isJsonObject(value)) return false;
  if (!isJsonString(value["name"])) return false;
  if (!isJsonString(value["type"])) return false;
  const files = value["files"];
  if (files !== undefined) {
    if (!Array.isArray(files)) return false;
    const filesValid = files.every(
      (file) => isJsonObject(file) && isJsonString(file["path"]) && isJsonString(file["content"]),
    );
    if (!filesValid) return false;
  }
  const dependencies = value["dependencies"];
  if (dependencies !== undefined && !isJsonStringArray(dependencies)) return false;
  const registryDependencies = value["registryDependencies"];
  if (registryDependencies !== undefined && !isJsonStringArray(registryDependencies)) {
    return false;
  }
  return true;
}

export function isRegistryFontItem(
  value: RegistryDecodeInput | undefined,
): value is RegistryFontItem {
  if (!isJsonObject(value)) return false;
  if (value["type"] !== "registry:font") return false;
  const font = value["font"];
  return (
    isJsonObject(font) &&
    isJsonString(font["family"]) &&
    isJsonString(font["dependency"]) &&
    isRegistryItem(value)
  );
}
