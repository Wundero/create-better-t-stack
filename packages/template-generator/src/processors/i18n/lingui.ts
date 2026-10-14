import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";

/**
 * Lingui dependency wiring (lane L5a).
 *
 * TODO(L5a): add the pinned `@lingui/*` packages to the owning workspaces,
 * register the Vite/SWC plugin for the selected surfaces, and wire the Bun
 * preload macro plugin for Bun-run hosts. Runs only when `config.i18n` is
 * `"lingui"`; the dispatcher lives in `processors/i18n-deps.ts`.
 */
export function getLinguiDeps(_vfs: VirtualFileSystem, _config: ProjectConfig): void {}
