import { DEFAULT_PRESETS, isValidPreset } from "@better-t-stack/types";

import type { Frontend } from "../types";

// Mirrors the React web predicate the generator uses when rendering React UI sections.
export const REACT_WEB_FRONTENDS: readonly Frontend[] = [
  "tanstack-router",
  "react-router",
  "tanstack-start",
  "next",
];

export function hasReactWebFrontend(frontend: readonly Frontend[]) {
  return frontend.some((value) => REACT_WEB_FRONTENDS.includes(value));
}

function isShadcnPresetUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function isValidShadcnPresetValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isValidPreset(trimmed)) return true;
  if (Object.hasOwn(DEFAULT_PRESETS, trimmed)) return true;
  return isShadcnPresetUrl(trimmed);
}

export function normalizeShadcnPreset(value: string) {
  return value.trim();
}
