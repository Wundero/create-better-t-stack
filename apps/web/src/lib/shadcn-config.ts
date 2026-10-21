import {
  DEFAULT_PRESET_CONFIG,
  encodePreset,
  type ShadcnBase,
  type ShadcnConfig,
} from "@better-t-stack/types";

// UI default for the shadcn component base. Kept local to the state layer so
// the config object omits the base until the user picks a non-default one.
export const DEFAULT_SHADCN_BASE: ShadcnBase = "baseui";

// The CLI requires a preset for any shadcn project, so the web surface always
// ships one. When the user configures base/rtl/pointer without picking a
// preset, this default-preset code is emitted instead of dropping the field.
export const DEFAULT_SHADCN_PRESET = encodePreset(DEFAULT_PRESET_CONFIG);

export type ShadcnStackFields = {
  shadcnPreset: string;
  shadcnBase: ShadcnBase;
  shadcnRtl: boolean;
  shadcnPointer: boolean;
};

// Collapses the four flat UI state fields into a single optional `shadcn`
// config object. Returns undefined when every field is at its default so
// `ProjectConfig` stays free of empty shadcn configs.
export function getShadcnConfig(stack: ShadcnStackFields): ShadcnConfig | undefined {
  const hasPreset = stack.shadcnPreset.length > 0;
  const hasCustomBase = stack.shadcnBase !== DEFAULT_SHADCN_BASE;
  const isConfigured = hasPreset || hasCustomBase || stack.shadcnRtl || stack.shadcnPointer;

  if (!isConfigured) {
    return undefined;
  }

  return {
    preset: hasPreset ? stack.shadcnPreset : DEFAULT_SHADCN_PRESET,
    base: stack.shadcnBase,
    rtl: stack.shadcnRtl,
    pointer: stack.shadcnPointer,
  };
}
