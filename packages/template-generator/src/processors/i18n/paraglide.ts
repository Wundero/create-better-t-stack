import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";

/**
 * Paraglide dependency wiring (lane L5b).
 *
 * TODO(L5b): add `@inlang/paraglide-js`, wire the Vite plugin and the CLI
 * compile for non-Vite surfaces, and set per-app `outdir`/ignore patterns.
 * Runs only when `config.i18n` is `"paraglide"`; the dispatcher lives in
 * `processors/i18n-deps.ts`.
 */
export function getParaglideDeps(_vfs: VirtualFileSystem, _config: ProjectConfig): void {}
