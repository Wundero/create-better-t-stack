import type { JsonObject } from "../core/json-types";
import type { VirtualFileSystem } from "../core/virtual-fs";

/**
 * Extracts a directory subtree from the virtual file system and remaps its
 * paths onto a new prefix, preserving nested structure.
 *
 * Pure: never mutates the source `vfs`. Only files whose path starts with
 * `${fromPrefix}/` are included. When `newPackageName` is provided, the `name`
 * field of the top-level `<toPrefix>/package.json` is rewritten.
 */
export function extractAndRenameSubtree(
  vfs: VirtualFileSystem,
  fromPrefix: string,
  toPrefix: string,
  newPackageName?: string,
): Map<string, string> {
  const from = `${fromPrefix}/`;
  const result = new Map<string, string>();

  for (const path of vfs.getAllFiles()) {
    if (!path.startsWith(from)) continue;

    const relative = path.slice(from.length);
    const dest = `${toPrefix}/${relative}`;
    const content = vfs.readFile(path);
    if (content === undefined) continue;

    if (newPackageName !== undefined && dest === `${toPrefix}/package.json`) {
      const parsed = JSON.parse(content) as JsonObject;
      parsed.name = newPackageName;
      result.set(dest, `${JSON.stringify(parsed, null, 2)}\n`);
      continue;
    }

    result.set(dest, content);
  }

  return result;
}
