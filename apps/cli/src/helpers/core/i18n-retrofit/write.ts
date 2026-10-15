import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { CLIError } from "../../../utils/errors";
import type { RetrofitEdit } from "./types";

interface FileSnapshot {
  fullPath: string;
  content: string | undefined;
}

/**
 * Apply a plan's file edits with snapshot/restore semantics (design D9): when a
 * write fails midway, every file it touched is restored to its prior state.
 * Manual edits are never written. Returns the number of files written.
 */
export async function writePlannedTree(
  projectDir: string,
  edits: readonly RetrofitEdit[],
): Promise<Result<number, CLIError>> {
  const files = edits.filter(
    (edit): edit is RetrofitEdit & { content: string } =>
      edit.kind !== "manual" && edit.content !== undefined,
  );

  const snapshots: FileSnapshot[] = [];
  try {
    for (const edit of files) {
      const fullPath = path.join(projectDir, edit.path);
      const existed = await fs.pathExists(fullPath);
      snapshots.push({
        fullPath,
        content: existed ? await fs.readFile(fullPath, "utf-8") : undefined,
      });
    }
  } catch (cause) {
    return Result.err(
      new CLIError({
        message: `Failed to snapshot existing files before writing: ${describe(cause)}`,
        cause,
      }),
    );
  }

  try {
    for (const edit of files) {
      const fullPath = path.join(projectDir, edit.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, edit.content, "utf-8");
    }
    return Result.ok(files.length);
  } catch (cause) {
    await Promise.all(
      snapshots.reverse().map(async (snapshot) => {
        try {
          if (snapshot.content === undefined) await fs.remove(snapshot.fullPath);
          else await fs.writeFile(snapshot.fullPath, snapshot.content, "utf-8");
        } catch {
          // Best-effort rollback: keep restoring the remaining files.
        }
      }),
    );
    return Result.err(
      new CLIError({ message: `Failed to write i18n files: ${describe(cause)}`, cause }),
    );
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
