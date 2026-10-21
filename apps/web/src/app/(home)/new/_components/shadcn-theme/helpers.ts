import {
  type PresetConfig,
  type ShadcnBase,
  DEFAULT_PRESET_CONFIG,
  decodePreset,
  encodePreset,
  isPresetCode,
} from "@better-t-stack/types";

import type { StackState } from "@/lib/constant";
import { DEFAULT_SHADCN_BASE } from "@/lib/shadcn-config";

// React web frontends for which the shadcn theme config is relevant. Mirrors
// the web frontends that ship a shadcn/React UI in the template generator.
export const REACT_WEB_FRONTENDS = [
  "next",
  "tanstack-router",
  "react-router",
  "tanstack-start",
] as const;

export function hasReactWebFrontend(stack: Pick<StackState, "webFrontend">): boolean {
  return stack.webFrontend.some((id) =>
    REACT_WEB_FRONTENDS.some((reactFrontend) => reactFrontend === id),
  );
}

export const SHADCN_BASE_OPTIONS: readonly { value: ShadcnBase; label: string }[] = [
  { value: "baseui", label: "Base UI" },
  { value: "radixui", label: "Radix UI" },
  { value: "react-aria", label: "React Aria" },
];

export function getShadcnBaseLabel(base: string | null | undefined): string {
  const match = SHADCN_BASE_OPTIONS.find((option) => option.value === base);
  return match ? match.label : String(base ?? "");
}

// The four shadcn-related StackState fields, kept together so the editor can
// pass a single value around.
export type ShadcnFields = Pick<
  StackState,
  "shadcnPreset" | "shadcnBase" | "shadcnRtl" | "shadcnPointer"
>;

// Single mapping from the editor's domain values onto stack state keys.
export function buildShadcnOptionsUpdate(options: {
  preset: string;
  base: ShadcnBase;
  rtl: boolean;
  pointer: boolean;
}): Partial<StackState> {
  return {
    shadcnPreset: options.preset,
    shadcnBase: options.base,
    shadcnRtl: options.rtl,
    shadcnPointer: options.pointer,
  };
}

export function resetShadcnFields(): Partial<StackState> {
  return buildShadcnOptionsUpdate({
    preset: "",
    base: DEFAULT_SHADCN_BASE,
    rtl: false,
    pointer: false,
  });
}

// Accepts either a bare preset code or a shadcn URL that carries one. Plain
// text is returned untouched; URLs prefer the `preset` (or legacy `theme`)
// query param and otherwise fall back to the last path segment.
export function extractPresetCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.includes("://")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("preset") ?? url.searchParams.get("theme");
    if (fromQuery) {
      return fromQuery.trim();
    }
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    return trimmed;
  }
}

export type ParsedPreset =
  | { ok: true; code: string; config: PresetConfig }
  | { ok: false; error: string };

export function parsePresetInput(input: string): ParsedPreset {
  const code = extractPresetCode(input);
  if (!code) {
    return { ok: false, error: "Enter a preset code or URL." };
  }
  if (!isPresetCode(code)) {
    return { ok: false, error: "That does not look like a shadcn preset code." };
  }
  const config = decodePreset(code);
  if (!config) {
    return { ok: false, error: "Invalid preset code." };
  }
  return { ok: true, code, config };
}

// Decoded config with every field present, so pickers never render undefined.
export function getPresetConfig(code: string): PresetConfig {
  const decoded = decodePreset(code);
  return decoded ? { ...DEFAULT_PRESET_CONFIG, ...decoded } : { ...DEFAULT_PRESET_CONFIG };
}

// Change one codec field and re-encode, keeping `shadcnPreset` a valid code.
export function updatePresetCode(currentCode: string, patch: Partial<PresetConfig>): string {
  return encodePreset({ ...getPresetConfig(currentCode), ...patch });
}

export function formatPresetFieldValue(value: string): string {
  return value
    .split("-")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export type ShadcnSummary = {
  presetLabel: string;
  baseLabel: string;
  rtl: boolean;
  pointer: boolean;
  isCustom: boolean;
};

export function getShadcnSummary(fields: ShadcnFields): ShadcnSummary {
  return {
    presetLabel: fields.shadcnPreset.length > 0 ? fields.shadcnPreset : "default",
    baseLabel: getShadcnBaseLabel(fields.shadcnBase),
    rtl: fields.shadcnRtl,
    pointer: fields.shadcnPointer,
    isCustom:
      fields.shadcnPreset.length > 0 ||
      fields.shadcnBase !== DEFAULT_SHADCN_BASE ||
      fields.shadcnRtl ||
      fields.shadcnPointer,
  };
}
