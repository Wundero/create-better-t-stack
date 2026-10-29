import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { applyShadcnThemeToVfs } from "../shadcn/apply";
import type { GenerationContext } from "../shadcn/context";
import { type TemplateData, processTemplatesFromPrefix } from "./utils";

export async function processConfigPackage(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  processTemplatesFromPrefix(vfs, templates, "packages/config", "packages/config", config);
}

export async function processUiPackage(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
  context?: GenerationContext,
): Promise<void> {
  const hasReactWeb = config.frontend.some((f) =>
    ["tanstack-router", "react-router", "tanstack-start", "next"].includes(f),
  );

  if (!hasReactWeb) return;

  processTemplatesFromPrefix(vfs, templates, "packages/ui", "packages/ui", config);

  if (context?.shadcn !== undefined) {
    applyShadcnThemeToVfs(vfs, config, context.shadcn);
  }
}
