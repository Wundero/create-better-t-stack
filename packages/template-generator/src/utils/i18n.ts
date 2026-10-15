import type { ProjectConfig } from "@better-t-stack/types";

/**
 * Uniform i18n script contract (design D8). The root `package.json` scripts,
 * the generated `packages/i18n/package.json` and the task-runner wiring all
 * use these exact names.
 */
export const I18N_SCRIPT_NAMES = [
  "i18n:extract",
  "i18n:compile",
  "i18n:pending",
  "i18n:apply",
  "i18n:check",
] as const;

export function hasI18n(config: ProjectConfig): boolean {
  return Boolean(config.i18n) && config.i18n !== "none";
}
