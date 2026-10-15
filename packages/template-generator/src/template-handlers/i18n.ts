import { getI18nSurfaces, type I18nSurface, type ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { processI18nIntegrationTemplates } from "../processors/i18n/integrations";
import { processI18nRoutingTemplates } from "../processors/i18n/routing";
import { processI18nSkillMirror } from "./i18n-skill";
import { processTemplatesFromPrefix, type TemplateData } from "./utils";

/**
 * Generated-project destination for each surface's i18n glue. Surfaces created
 * by an external scaffolder (WXT, OpenTUI) still resolve here so the
 * templates land inside the app the scaffolders own.
 */
const SURFACE_DESTINATIONS = {
  next: "apps/web",
  "tanstack-start": "apps/web",
  "tanstack-router": "apps/web",
  "react-router": "apps/web",
  nuxt: "apps/web",
  svelte: "apps/web",
  solid: "apps/web",
  astro: "apps/web",
  native: "apps/native",
  server: "apps/server",
  email: "packages/email",
  "electrobun-host": "apps/desktop",
  "opentui-core": "apps/tui",
  "opentui-react": "apps/tui",
  "opentui-solid": "apps/tui",
  "wxt-vanilla": "apps/extension",
  "wxt-react": "apps/extension",
  "wxt-solid": "apps/extension",
  "wxt-vue": "apps/extension",
  "wxt-svelte": "apps/extension",
} satisfies Record<I18nSurface, string>;

/**
 * i18n templates. Every lane owns its own template namespace:
 * `i18n/shared` (L4), `i18n/lib/<library>` and `i18n/surface/<library>/<surface>`
 * (L5a–L5d), `i18n/routing` and `i18n/integrations` (L6–L7), and `i18n/skill` (L9).
 */
export async function processI18nTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  const library = config.i18n;
  if (!library || library === "none") return;

  processTemplatesFromPrefix(vfs, templates, "i18n/shared", "packages/i18n", config);
  processTemplatesFromPrefix(vfs, templates, `i18n/lib/${library}`, "packages/i18n", config);

  for (const surface of getI18nSurfaces(config)) {
    processTemplatesFromPrefix(
      vfs,
      templates,
      `i18n/surface/${library}/${surface}`,
      SURFACE_DESTINATIONS[surface],
      config,
    );
  }

  processI18nRoutingTemplates(vfs, templates, config);
  processI18nIntegrationTemplates(vfs, templates, config);

  // Decision (design D8, spec gates only `i18n-translate`): `i18n-adopt` shares
  // the single `translateSkill` toggle. Both skills are the agent-driven
  // translation surface, so `--no-i18n-skill` opts out of both and the user
  // keeps one knob.
  if (config.i18nOptions?.translateSkill ?? true) {
    processTemplatesFromPrefix(vfs, templates, "i18n/skill", ".agents/skills", config);
    processI18nSkillMirror(vfs, templates, config);
  }
}
