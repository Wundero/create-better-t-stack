import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";

/**
 * i18next dependency wiring (lane L5c).
 *
 * TODO(L5c): add `i18next` and the per-surface adapters (`react-i18next`,
 * `i18next-vue`, the shipped Svelte store and Solid primitive), configure the
 * `i18next-cli` extractor, and use natural-language keys. Runs only when
 * `config.i18n` is `"i18next"`; the dispatcher lives in
 * `processors/i18n-deps.ts`.
 */
export function getI18nextDeps(_vfs: VirtualFileSystem, _config: ProjectConfig): void {}
