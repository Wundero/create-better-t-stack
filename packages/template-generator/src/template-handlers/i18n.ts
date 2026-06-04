import type { ProjectConfig } from "@wundero/create-better-t-stack-types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { type TemplateData, processTemplatesFromPrefix } from "./utils";

export async function processI18nTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  if (config.i18n === "none") {
    return;
  }

  processTemplatesFromPrefix(vfs, templates, "addons/i18n", "", config);
}
