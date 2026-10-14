import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";

/**
 * wuchale dependency wiring (lane L5d; experimental).
 *
 * TODO(L5d): add `wuchale`, keep its built-in AI translation disabled by
 * omitting the `ai` config, and scope the include globs per surface. Runs only
 * when `config.i18n` is `"wuchale"`; the dispatcher lives in
 * `processors/i18n-deps.ts`.
 */
export function getWuchaleDeps(_vfs: VirtualFileSystem, _config: ProjectConfig): void {}
