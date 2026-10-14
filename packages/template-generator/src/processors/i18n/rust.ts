import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import type { TemplateData } from "../../template-handlers/utils";

/**
 * Rust (Tauri) i18n crate templates (lane L8).
 *
 * TODO(L8): emit `templates/i18n/rust/**` into `packages/i18n/rust` and the
 * `src-tauri` wiring templates. Called by `template-handlers/i18n.ts`.
 */
export function processI18nRustTemplates(
  _vfs: VirtualFileSystem,
  _templates: TemplateData,
  _config: ProjectConfig,
): void {}

/**
 * Rust (Tauri) i18n dependencies (lane L8).
 *
 * TODO(L8): the `i18n:export` normalized catalog, the generated crate, and the
 * `tauri-setup.ts` post-step (Cargo dependency, `set_locale`, `sys-locale`,
 * menu rebuild). Only when the Tauri addon and i18n are both selected.
 * Called by `processors/i18n-deps.ts`.
 */
export function getI18nRustDeps(_vfs: VirtualFileSystem, _config: ProjectConfig): void {}
