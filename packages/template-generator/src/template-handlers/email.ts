import type { ProjectConfig } from "@wundero/create-better-t-stack-types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { type TemplateData, processTemplatesFromPrefix } from "./utils";

export async function processEmailTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  if (config.email === "none") return;

  processTemplatesFromPrefix(
    vfs,
    templates,
    "addons/email/packages/email",
    "packages/email",
    config,
  );
}
