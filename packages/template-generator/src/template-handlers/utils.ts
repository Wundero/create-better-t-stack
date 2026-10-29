import type { ProjectConfig } from "@better-t-stack/types";

import { processTemplateString, transformFilename, isBinaryFile } from "../core/template-processor";
import type { TemplateData } from "../core/template-spec";
import type { VirtualFileSystem } from "../core/virtual-fs";

export type { TemplateData } from "../core/template-spec";

export function hasTemplatesWithPrefix(templates: TemplateData, prefix: string): boolean {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  for (const path of templates.keys()) {
    if (path.startsWith(normalizedPrefix)) return true;
  }
  return false;
}

export function processSingleTemplate(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  templatePath: string,
  destPath: string,
  config: ProjectConfig,
): void {
  const templateKey = templatePath.endsWith(".hbs") ? templatePath : `${templatePath}.hbs`;
  const entry = templates.get(templateKey);

  if (!entry) return;

  const processedContent =
    entry.kind === "raw" ? entry.content : processTemplateString(entry, config);

  // Pass original template path for binary files
  const sourcePath = isBinaryFile(templateKey) ? templateKey : undefined;
  vfs.writeFile(destPath, processedContent, sourcePath);
}

export function processTemplatesFromPrefix(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  prefix: string,
  destPrefix: string,
  config: ProjectConfig,
): void {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

  for (const [templatePath, entry] of templates) {
    if (!templatePath.startsWith(normalizedPrefix)) continue;

    const relativePath = templatePath.slice(normalizedPrefix.length);
    const outputPath = transformFilename(relativePath);
    const destPath = destPrefix ? `${destPrefix}/${outputPath}` : outputPath;

    const processedContent =
      entry.kind === "raw" ? entry.content : processTemplateString(entry, config);

    // Pass original template path for binary files
    const sourcePath = isBinaryFile(templatePath) ? templatePath : undefined;
    vfs.writeFile(destPath, processedContent, sourcePath);
  }
}
