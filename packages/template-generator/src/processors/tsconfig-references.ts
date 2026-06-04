import type { ProjectConfig } from "@wundero/create-better-t-stack-types";

import type { VirtualFileSystem } from "../core/virtual-fs";

/**
 * Post-processor that scans generated paths for tsconfig.json files
 * and writes a solution-style root tsconfig.json with project references.
 *
 * Only adds references for packages (not framework apps that may have
 * incompatible composite requirements).
 */
export function processTsconfigReferences(vfs: VirtualFileSystem, _config: ProjectConfig): void {
  const rootTsconfigPath = "tsconfig.json";
  if (!vfs.exists(rootTsconfigPath)) {
    return;
  }

  const rootTsconfig = vfs.readJson<Record<string, unknown>>(rootTsconfigPath);
  if (!rootTsconfig) {
    return;
  }

  // Start with files: [] for solution-style config
  rootTsconfig.files = [];

  // Scan for tsconfig.json files in apps/* and packages/*
  const references: Array<{ path: string }> = [];

  for (const dir of ["apps", "packages"]) {
    if (!vfs.directoryExists(dir)) {
      continue;
    }

    // List immediate subdirectories
    // VirtualFileSystem doesn't expose directory listing, so we
    // scan known paths from the VFS tree
    const entries = vfs.getAllFiles().filter((p) => p.startsWith(`${dir}/`));
    const subdirs = new Set<string>();

    for (const entry of entries) {
      const relative = entry.slice(`${dir}/`.length);
      const firstSlash = relative.indexOf("/");
      if (firstSlash > 0) {
        subdirs.add(`${dir}/${relative.slice(0, firstSlash)}`);
      }
    }

    for (const subdir of subdirs) {
      if (vfs.exists(`${subdir}/tsconfig.json`)) {
        references.push({ path: `./${subdir}` });
      }
    }
  }

  // Sort for deterministic output
  references.sort((a, b) => a.path.localeCompare(b.path));

  if (references.length > 0) {
    rootTsconfig.references = references;
  }

  vfs.writeFile(rootTsconfigPath, JSON.stringify(rootTsconfig, null, 2) + "\n");
}
