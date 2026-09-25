import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { type TemplateData, processSingleTemplate, processTemplatesFromPrefix } from "./utils";

export async function processEmailPackage(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  if (config.emailRenderer === "none" && config.emailDeploy === "none") return;

  // Structural files live at the package root and are always emitted.
  processSingleTemplate(
    vfs,
    templates,
    "packages/email/package.json",
    "packages/email/package.json",
    config,
  );
  processSingleTemplate(
    vfs,
    templates,
    "packages/email/tsconfig.json",
    "packages/email/tsconfig.json",
    config,
  );

  // The barrel always ships so `src/index.ts` exists for every enabled combo.
  processTemplatesFromPrefix(vfs, templates, "packages/email/base", "packages/email", config);

  if (config.emailRenderer === "react-email") {
    processTemplatesFromPrefix(vfs, templates, "packages/email/render", "packages/email", config);
  }

  if (config.emailDeploy !== "none") {
    processTemplatesFromPrefix(
      vfs,
      templates,
      `packages/email/deploy/${config.emailDeploy}`,
      "packages/email",
      config,
    );
  }
}
