import {
  DEFAULT_PRESET_CONFIG,
  DEFAULT_PRESETS,
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONTS,
  PRESET_FONT_HEADINGS,
  PRESET_ICON_LIBRARIES,
  PRESET_MENU_ACCENTS,
  PRESET_MENU_COLORS,
  PRESET_RADII,
  PRESET_STYLES,
  PRESET_THEMES,
  SHADCN_BASE_TO_REGISTRY,
  decodePreset,
  encodePreset,
  isPresetCode,
  type PresetConfig,
  type ProjectConfig,
} from "@better-t-stack/types";
import { Result } from "better-result";

import { transformComponentSource } from "./apply";
import { resolveComponentClosure, SHADCN_RTL_COMPONENT, SHADCN_UI_COMPONENTS } from "./components";
import { shadcnAliases } from "./components-json";
import {
  ShadcnRegistryError,
  isRegistryFontItem,
  type RegistryBase,
  type RegistryFont,
  type RegistryItem,
  type ResolveBaseInput,
  type ShadcnIconLibrary,
  type ShadcnRegistryClient,
} from "./types";

/**
 * A fully materialized shadcn theme ready to be written into a generated
 * project: the registry base envelope, the transformed component sources, the
 * util source, the font items and the npm dependencies the registry requires.
 */
export interface ResolvedShadcnTheme {
  base: RegistryBase;
  style: string;
  iconLibrary: ShadcnIconLibrary;
  rtl: boolean;
  pointer: boolean;
  fonts: readonly RegistryFont[];
  components: ReadonlyMap<string, string>;
  utilsSource: string;
  dependencies: readonly string[];
  directionSource?: string;
}

interface PresetResolution {
  params: PresetConfig;
  code?: string;
}

function invalidPresetError(preset: string): ShadcnRegistryError {
  return new ShadcnRegistryError({
    message: `shadcn preset "${preset}" is neither a preset code, a named preset, nor a registry URL`,
    url: "",
    status: null,
  });
}

function isDefaultPresetName(value: string): value is keyof typeof DEFAULT_PRESETS {
  return Object.prototype.hasOwnProperty.call(DEFAULT_PRESETS, value);
}

function pickValue<T extends string>(
  values: readonly T[],
  candidate: string | null,
  fallback: T,
): T {
  return values.find((value) => value === candidate) ?? fallback;
}

function presetFromUrl(preset: string): Result<PresetResolution, ShadcnRegistryError> {
  let url: URL;
  try {
    url = new URL(preset);
  } catch {
    return Result.err(invalidPresetError(preset));
  }

  const params = url.searchParams;
  const code = params.get("preset");
  const resolution: PresetResolution = {
    params: {
      style: pickValue(PRESET_STYLES, params.get("style"), DEFAULT_PRESET_CONFIG.style),
      baseColor: pickValue(
        PRESET_BASE_COLORS,
        params.get("baseColor"),
        DEFAULT_PRESET_CONFIG.baseColor,
      ),
      theme: pickValue(PRESET_THEMES, params.get("theme"), DEFAULT_PRESET_CONFIG.theme),
      chartColor: pickValue(
        PRESET_CHART_COLORS,
        params.get("chartColor"),
        DEFAULT_PRESET_CONFIG.chartColor ?? "neutral",
      ),
      iconLibrary: pickValue(
        PRESET_ICON_LIBRARIES,
        params.get("iconLibrary"),
        DEFAULT_PRESET_CONFIG.iconLibrary,
      ),
      font: pickValue(PRESET_FONTS, params.get("font"), DEFAULT_PRESET_CONFIG.font),
      fontHeading: pickValue(
        PRESET_FONT_HEADINGS,
        params.get("fontHeading"),
        DEFAULT_PRESET_CONFIG.fontHeading,
      ),
      radius: pickValue(PRESET_RADII, params.get("radius"), DEFAULT_PRESET_CONFIG.radius),
      menuAccent: pickValue(
        PRESET_MENU_ACCENTS,
        params.get("menuAccent"),
        DEFAULT_PRESET_CONFIG.menuAccent,
      ),
      menuColor: pickValue(
        PRESET_MENU_COLORS,
        params.get("menuColor"),
        DEFAULT_PRESET_CONFIG.menuColor,
      ),
    },
  };
  if (code !== null && code.length > 0) {
    resolution.code = code;
  }
  return Result.ok(resolution);
}

function resolvePresetInput(preset: string): Result<PresetResolution, ShadcnRegistryError> {
  if (isPresetCode(preset)) {
    const decoded = decodePreset(preset);
    if (decoded !== null) return Result.ok({ params: decoded, code: preset });
  }

  if (isDefaultPresetName(preset)) {
    return Result.ok({
      params: DEFAULT_PRESETS[preset],
      code: encodePreset(DEFAULT_PRESETS[preset]),
    });
  }

  if (preset.startsWith("http://") || preset.startsWith("https://")) {
    return presetFromUrl(preset);
  }

  return Result.err(invalidPresetError(preset));
}

function toIconLibrary(value: string): ShadcnIconLibrary {
  return PRESET_ICON_LIBRARIES.find((library) => library === value) ?? "lucide";
}

async function resolveFonts(
  client: ShadcnRegistryClient,
  style: string,
  registryDependencies: readonly string[],
): Promise<Result<RegistryFont[], ShadcnRegistryError>> {
  const fonts: RegistryFont[] = [];
  for (const name of registryDependencies) {
    if (!name.startsWith("font-")) continue;
    const itemResult = await client.getItem(style, name);
    if (itemResult.isErr()) return Result.err(itemResult.error);
    if (isRegistryFontItem(itemResult.value)) fonts.push(itemResult.value.font);
  }
  return Result.ok(fonts);
}

async function resolveUtilsSource(
  client: ShadcnRegistryClient,
  style: string,
): Promise<Result<string, ShadcnRegistryError>> {
  const itemResult = await client.getItem(style, "utils");
  if (itemResult.isErr()) return Result.err(itemResult.error);
  const content = itemResult.value.files?.[0]?.content;
  if (content === undefined) {
    return Result.err(
      new ShadcnRegistryError({
        message: `shadcn registry item "utils" for style "${style}" carried no file content`,
        url: "",
        status: null,
      }),
    );
  }
  return Result.ok(content);
}

/**
 * The deduped, first-seen npm dependencies the registry base and its component
 * closure introduce. Font packages are excluded: each font carries its own
 * `RegistryFont.dependency` and the ui package composer pins those separately.
 * `registryDependencies` are component references (and `utils`/`font-*`), never
 * npm package names, so they are not collected here.
 */
function collectDependencies(
  base: RegistryBase,
  components: ReadonlyMap<string, RegistryItem>,
  fonts: readonly RegistryFont[],
): string[] {
  const fontDependencies = new Set(fonts.map((font) => font.dependency));
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: string): void => {
    if (seen.has(name) || fontDependencies.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  for (const name of base.dependencies) add(name);
  for (const item of components.values()) {
    for (const name of item.dependencies ?? []) add(name);
  }
  return names;
}

/**
 * Resolves a project's shadcn configuration against a registry client into a
 * `ResolvedShadcnTheme`. The preset is authoritative for style/theme/fonts/icon
 * library; `base`, `rtl` and `pointer` act as overrides. Every registry failure
 * is surfaced as a typed `ShadcnRegistryError`.
 */
export async function resolveShadcnTheme(
  config: ProjectConfig,
  client: ShadcnRegistryClient,
): Promise<Result<ResolvedShadcnTheme, ShadcnRegistryError>> {
  const shadcn = config.shadcn;
  const preset = shadcn?.preset;
  if (preset === undefined || preset.length === 0) {
    return Result.err(
      new ShadcnRegistryError({
        message: "A shadcn configuration requires a preset",
        url: "",
        status: null,
      }),
    );
  }

  const presetResult = resolvePresetInput(preset);
  if (presetResult.isErr()) return Result.err(presetResult.error);
  const { params, code } = presetResult.value;

  const rtl = shadcn?.rtl ?? false;
  const pointer = shadcn?.pointer ?? false;

  const input: ResolveBaseInput = {
    base: SHADCN_BASE_TO_REGISTRY[shadcn?.base ?? "baseui"],
    style: params.style,
    baseColor: params.baseColor,
    theme: params.theme,
    iconLibrary: params.iconLibrary,
    font: params.font,
    radius: params.radius,
    menuColor: params.menuColor,
    menuAccent: params.menuAccent,
    fontHeading: params.fontHeading,
    chartColor: params.chartColor,
    rtl,
    pointer,
  };
  if (code !== undefined) {
    input.preset = code;
  }

  const baseResult = await client.resolveBase(input);
  if (baseResult.isErr()) return Result.err(baseResult.error);
  const resolvedBase = baseResult.value;
  const style = resolvedBase.config.style;

  const fontsResult = await resolveFonts(client, style, resolvedBase.registryDependencies);
  if (fontsResult.isErr()) return Result.err(fontsResult.error);
  const fonts = fontsResult.value;

  const componentNames = [...SHADCN_UI_COMPONENTS, ...(rtl ? [SHADCN_RTL_COMPONENT] : [])];
  const closureResult = await resolveComponentClosure(client, style, componentNames);
  if (closureResult.isErr()) return Result.err(closureResult.error);

  const iconLibrary = toIconLibrary(resolvedBase.config.iconLibrary);
  const aliases = shadcnAliases(config.projectName);
  const components = new Map<string, string>();
  let directionSource: string | undefined;

  for (const [name, item] of closureResult.value) {
    const content = item.files?.[0]?.content;
    if (content === undefined) continue;
    const transformed = transformComponentSource(content, { aliases, iconLibrary });
    if (name === SHADCN_RTL_COMPONENT) {
      directionSource = transformed;
      continue;
    }
    components.set(name, transformed);
  }

  const utilsResult = await resolveUtilsSource(client, style);
  if (utilsResult.isErr()) return Result.err(utilsResult.error);

  const resolvedTheme: ResolvedShadcnTheme = {
    base: resolvedBase,
    style,
    iconLibrary,
    rtl,
    pointer,
    fonts,
    components,
    utilsSource: utilsResult.value,
    dependencies: collectDependencies(resolvedBase, closureResult.value, fonts),
  };
  if (directionSource !== undefined) {
    resolvedTheme.directionSource = directionSource;
  }
  return Result.ok(resolvedTheme);
}
