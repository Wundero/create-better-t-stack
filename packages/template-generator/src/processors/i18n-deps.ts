import type { I18nLibrary, ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { getI18nextDeps } from "./i18n/i18next";
import { processI18nIntegrations } from "./i18n/integrations";
import { getLinguiDeps } from "./i18n/lingui";
import { getParaglideDeps } from "./i18n/paraglide";
import { processI18nRouting } from "./i18n/routing";
import { getWuchaleDeps } from "./i18n/wuchale";

type I18nDeps = (vfs: VirtualFileSystem, config: ProjectConfig) => void;

/**
 * One entry per library. Each library lane (L5a–L5d) fills out only its own
 * file, so library branches never edit the same lines.
 */
const I18N_LIBRARY_DEPS = {
  lingui: getLinguiDeps,
  paraglide: getParaglideDeps,
  i18next: getI18nextDeps,
  wuchale: getWuchaleDeps,
} satisfies Record<I18nLibrary, I18nDeps>;

/**
 * i18n dependency processing. Library deps come first, then the cross-library
 * concerns (routing L6, built-in localization L7), each in its own stub file
 * until its lane lands.
 */
export function processI18nDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const library = config.i18n;
  if (!library || library === "none") return;

  I18N_LIBRARY_DEPS[library](vfs, config);
  processI18nRouting(vfs, config);
  processI18nIntegrations(vfs, config);
}
